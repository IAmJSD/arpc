import type { Command } from "commander";
import { writeFileSync, readFileSync } from "fs";
import type { BuildData, Enum, Method, Methods, Signature } from "@arpc/client-gen";
import { getBuildData } from "../utils/getBuildData";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { error, success } from "../utils/console";

// Handles checking if a item is still used.
class UsageChecker {
    private _buildData: BuildData;
    private _json: string | undefined;

    constructor(buildData: BuildData) {
        this._buildData = buildData;
    }

    check(type: string | string[], keyName: string, key: string) {
        if (!this._json) {
            this._json = JSON.stringify(this._buildData);
        }

        if (Array.isArray(type)) {
            for (const t of type) {
                if (this.check(t, keyName, key)) {
                    return true;
                }
            }
            return false;
        }

        const needle = JSON.stringify({ type, [keyName]: key });
        return this._json.includes(needle);
    }
}

// Compare the enums.
function compareEnums(
    buildData: BuildData, compareData: BuildData, compareFile: string,
    errors: string[],
) {
    // Get the enums from the data we are comparing to.
    const oldEnums = compareData.enums;
    if (!Array.isArray(oldEnums)) {
        error(`Could not find the enums array in the compare file ${compareFile}.`);
    }
    const oldEnumsMapping = new Map<string, Enum>();
    for (const e of oldEnums) {
        if (typeof e !== "object" || typeof e.name !== "string") {
            error("Could not find the name in the compare file enums.");
        }
        oldEnumsMapping.set(e.name, e);
    }

    // Get the clients from the new data.
    const newEnumsMapping = new Map<string, Enum>();
    for (const e of buildData.enums) {
        newEnumsMapping.set(e.name, e);
    }

    // Go through each old enum and compare.
    const usages = new UsageChecker(buildData);
    for (const [key, oldEnum] of oldEnumsMapping) {
        const newEnum = newEnumsMapping.get(key);
        if (!newEnum) {
            // If there's no usages, this can go.
            if (!usages.check(["enum_key", "enum_value"], "enum", key)) continue;

            // The enum is not in the new data but is used.
            errors.push(`The enum ${key} was removed.`);
            continue;
        }

        // Check if the signature is different.
        if (
            JSON.stringify(oldEnum.valueType) !== JSON.stringify(newEnum.valueType)
        ) {
            errors.push(`The enum type for ${key} was changed.`);
        }

        // Go through the values.
        for (const [k, v] of oldEnum.data) {
            if (newEnum.data.get(k) !== v) {
                errors.push(`The enum value ${k} for ${key} was changed.`);
            }
        }
    }
}

// Compare the objects.
function compareObjects(
    buildData: BuildData, compareData: BuildData, compareFile: string,
    errors: string[],
) {
    // TODO
}

// Handle that the old/new inputs might be undefined.
function compareInputs(
    old: Signature | undefined, new_: Signature | undefined, namespace: string,
    errors: string[],
) {
    if (!old) {
        // Check if new is nullable or undefined.
        if (!new_ || new_.type === "nullable") {
            // The input is safe with no input.
            return;
        }

        // If it is different in the same API version, this is a breaking change.
        errors.push(`A non-nullable input was added to ${namespace}.`);
        return;
    }

    // If there is no new input, return here. This is fine because the input will
    // simply be ignored.
    if (!new_) return;

    // Check if the input goes nullable > non-nullable.
    if (old.type === "nullable" && new_.type !== "nullable") {
        errors.push(`The input of ${namespace} was changed to non-nullable.`);
    }

    // Unwrap the nullable type.
    while (old.type === "nullable") old = old.inner;
    while (new_.type === "nullable") new_ = new_.inner;

    // Handle if the type is changed to a union that contains our type.
    if (new_.type === "union" && old.type !== "union") {
        for (const inner of new_.inner) {
            const innerErrors = [];
            compareInputs(old, inner, namespace, innerErrors);
            if (innerErrors.length === 0) {
                // The input type that the client will use is valid.
                return;
            }
        }

        // If it is different in the same API version, this is a breaking change.
        errors.push(`The input of ${namespace} was changed to a union that does not contain the old signature.`);
    }

    // Error if the types are different.
    if (old.type !== new_.type) {
        errors.push(`The input of ${namespace} was changed from ${old.type} to ${new_.type}.`);
    }

    // Switch on the type.
    switch (old.type) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
        // Nothing to compare. This is fine.
        return;
    case "array":
        // Handle the inner type.
        compareInputs(old.inner, (new_ as any).inner, `${namespace}[]`, errors);
        return;
    case "union":
        // Make sure that all the types in the old union are in the new union.
        for (const inner of old.inner) {
            let found = false;
            for (const newInner of (new_ as any).inner) {
                const innerErrors = [];
                compareInputs(inner, newInner, namespace, innerErrors);
                if (innerErrors.length === 0) {
                    found = true;
                    break;
                }
            }

            // If the inner type is not found, this is a breaking change.
            if (!found) {
                errors.push(`The input of ${namespace} was changed to a union that does not contain the old signature.`);
                return;
            }
        }
        return;
    case "map":
        // Handle the key and value types.
        compareInputs(
            old.key, (new_ as any).key, `keyof ${namespace}`, errors,
        );
        compareInputs(
            old.value, (new_ as any).value, `${namespace}[K]`, errors,
        );
        return;
    case "object":
        // Handle the object key.
        if (old.key !== (new_ as any).key) {
            errors.push(`The input of ${namespace} was changed to a object named ${(new_ as any).key}.`);
        }
        return;
    case "enum_key":
    case "enum_value":
        // Handle the enum.
        if (old.enum !== (new_ as any).enum) {
            errors.push(`The input of ${namespace} was changed to a enum named ${(new_ as any).enum}.`);
        }
        return;
    case "literal":
        // Handle the literal value.
        if (old.value !== (new_ as any).value) {
            errors.push(`The input of ${namespace} was changed to a literal value of ${(new_ as any).value}.`);
        }
        return;
    }
}

// Handle the output case that the output cannot be turned nullable.
function compareOutputs(
    old: Signature, new_: Signature, namespace: string, errors: string[],
) {
   // Check if the old input is not nullable but the new one is.
    if (old.type !== "nullable" && new_.type === "nullable") {
        errors.push(`The output of ${namespace} was changed to nullable.`);
    }

    // Unwrap the nullable type.
    while (old.type === "nullable") old = old.inner;
    while (new_.type === "nullable") new_ = new_.inner;

    // Error if the types are different.
    if (old.type !== new_.type) {
        errors.push(`The output of ${namespace} was changed from ${old.type} to ${new_.type}.`);
    }

    // Switch on the type.
    switch (old.type) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
        // Nothing to compare. This is fine.
        return;
    case "array":
        // Handle the inner type.
        compareOutputs(old.inner, (new_ as any).inner, `${namespace}[]`, errors);
        return;
    case "union":
        // Check if the new union only contains things that the old union contains.
        for (const inner of (new_ as any).inner) {
            let found = false;
            for (const oldInner of old.inner) {
                const innerErrors = [];
                compareOutputs(oldInner, inner, namespace, innerErrors);
                if (innerErrors.length === 0) {
                    found = true;
                    break;
                }
            }

            // If the inner type is not found, this is a breaking change.
            if (!found) {
                errors.push(`The output of ${namespace} was changed to a union that does not contain the old signature.`);
                return;
            }
        }
        return;
    case "map":
        // Handle the key and value types.
        compareOutputs(
            old.key, (new_ as any).key, `keyof ${namespace}`, errors,
        );
        compareOutputs(
            old.value, (new_ as any).value, `${namespace}[K]`, errors,
        );
        return;
    case "object":
        // Handle the object key.
        if (old.key !== (new_ as any).key) {
            errors.push(`The output of ${namespace} was changed to a object named ${(new_ as any).key}.`);
        }
        return;
    case "enum_key":
    case "enum_value":
        // Handle the enum.
        if (old.enum !== (new_ as any).enum) {
            errors.push(`The output of ${namespace} was changed to a enum named ${(new_ as any).enum}.`);
        }
        return;
    case "literal":
        // Handle the literal value.
        if (old.value !== (new_ as any).value) {
            errors.push(`The output of ${namespace} was changed to a literal value of ${(new_ as any).value}.`);
        }
        return;
    }
}

// Compares the clients.
function compateClients(
    buildData: BuildData, compareData: BuildData, compareFile: string,
    errors: string[],
) {
    // Get the clients from the data we are comparing to.
    const oldClients = compareData.clients;
    if (!Array.isArray(oldClients)) {
        error(`Could not find the clients array in the compare file ${compareFile}.`);
    }
    const oldClientsMapping = new Map<string, [string | null, Methods]>();
    for (const client of oldClients) {
        if (typeof client !== "object" || typeof client.apiVersion !== "string") {
            error("Could not find the apiVersion in the compare file clients.");
        }
        if (typeof client.methods !== "object" || Array.isArray(client.methods)) {
            error("Could not find the methods object in the compare file clients.");
        }
        oldClientsMapping.set(client.apiVersion, [client.description, client.methods]);
    }

    // Get the clients from the new data.
    const newClientsMapping = new Map<string, Methods>();
    for (const client of buildData.clients) {
        newClientsMapping.set(client.apiVersion, client.methods);
    }

    // Go through each client and compare the methods to look for breaking changes.
    for (const [version, [description, methods]] of oldClientsMapping) {
        // Get the new methods.
        const newMethods = newClientsMapping.get(version);
        if (!newMethods) {
            // Check if it was deprecated before hand.
            if (description && description.includes("Deprecated:")) {
                continue;
            }

            // If it wasn't deprecated, this is a breaking change.
            errors.push(`The API version ${version} was removed.`);
            continue;
        }

        // Go through each method/category and compare.
        function handleMethodsAndCategories(
            old: Methods, new_: Methods, namespace: string[],
        ) {
            for (const [methodName, oldMethodOrCat] of Object.entries(old)) {
                // Check if the method was removed.
                const newMethodOrCat = new_[methodName];
                if (!newMethodOrCat) {
                    // If it is different in the same client, this is a breaking change.
                    errors.push(`The method ${namespace.concat(methodName).join(".")} was removed.`);

                    // Nothing to compare to.
                    continue;
                }

                // Handle method categories.
                const oldIsMethod = typeof oldMethodOrCat.mutation === "boolean";
                const newIsMethod = typeof newMethodOrCat.mutation === "boolean";
                if (!oldIsMethod) {
                    // Check if new is a method.
                    if (newIsMethod) {
                        errors.push(`The category ${namespace.concat(methodName).join(".")} was changed to a method.`);
                        continue;
                    }

                    // Recurse into the category.
                    namespace.push(methodName);
                    handleMethodsAndCategories(
                        oldMethodOrCat as Methods, newMethodOrCat as Methods,
                        namespace,
                    );
                    namespace.pop();
                    continue;
                }

                // Check if the method was changed to a category.
                if (!newIsMethod) {
                    errors.push(`The method ${namespace.concat(methodName).join(".")} was changed to a category.`);
                    continue;
                }

                // Compare the inputs.
                compareInputs(
                    (oldMethodOrCat as Method).input?.signature,
                    (newMethodOrCat as Method).input?.signature,
                    `${namespace.join(".")}.${methodName}`, errors,
                );

                // Compare the outputs.
                compareOutputs(
                    (oldMethodOrCat as Method).output,
                    (newMethodOrCat as Method).output,
                    `${namespace.join(".")}.${methodName}`, errors,
                );

                // Check if it changed from no mutation to mutation.
                if (!oldMethodOrCat.mutation && oldMethodOrCat.mutation) {
                    errors.push(`The method ${namespace.concat(methodName).join(".")} was changed to a mutation.`);
                }
            }
        }
        try {
            handleMethodsAndCategories(methods, newMethods, [version]);
        } catch (err) {
            errors.push(`Error comparing API version ${version}: ${(err as Error).message}`);
        }
    }
    
}

// Handle the command action.
async function cmdAction(options: { [key: string]: string }) {
    // Make sure we are in a RPC project.
    const { repoFolderStructure } = requiresRpcInit();

    // Get the build data and write it if applicable.
    const buildData = await getBuildData(repoFolderStructure.nextFolder);
    if (options.output) {
        // Write the build data to a file.
        const j = JSON.stringify(buildData, null, 4);
        try {
            writeFileSync(options.output, j);
        } catch {
            error(`Could not write the build data to ${options.output}.`);
        }
    }

    // If we have nothing to compare to, this is fine.
    if (!options.compare) {
        success("Build data is valid.");
        return;
    }

    // Get the data to compare to.
    let compareData: BuildData;
    try {
        compareData = JSON.parse(readFileSync(options.compare, "utf-8"));
    } catch {
        error(`Could not read the compare file ${options.compare}.`);
    }
    if (typeof compareData !== "object" || Array.isArray(compareData)) {
        error(`Could not parse the compare file ${options.compare} as a object.`);
    }

    // Defines the errors.
    const errors: string[] = [];

    // Compare the enums.
    compareEnums(buildData, compareData, options.compare, errors);

    // Compare the objects.
    compareObjects(buildData, compareData, options.compare, errors);

    // Compare the clients.
    compateClients(buildData, compareData, options.compare, errors);

    // Handle the error result.
    if (errors.length === 0) {
        success("Build data is valid and no breaking changes were found!");
        return;
    }
    const output = errors.map((text) => `\x1b[31m✖  ${text}\x1b[0m`).join("\n");
    console.error(`${output}
${errors.length} validation failure${errors.length === 1 ? "" : "s"} found in difference with older version.`);
    process.exit(1);
}

export function lint(cmd: Command) {
    const r = cmd
        .description("Lints the RPC server build data and optionally compares to previous outputs.")
        .option("--output [output]", "The file to output the build data JSON to.")
        .option("--compare [compare]", "The file to compare the build data JSON to.")
        .action(async () => {
            await cmdAction(r.opts());
        });
}
