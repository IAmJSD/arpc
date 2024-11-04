import { InvalidArgumentError, type Command } from "commander";
import { join, dirname } from "path";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { stat, writeFile, unlink } from "fs/promises";
import { Lockfile, stringify } from "@arpc-packages/lockfile";
import { versionParser, RPCVersionWithCache } from "../utils/versionParser";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { sortVersions } from "../utils/sortVersions";
import { error, success } from "../utils/console";
import { argumentWithParser } from "../utils/argumentWithParser";
import { regenerateNextState } from "../utils/regenerateNextState";

const authRoutePlaceholder = `import z from "zod";
import { UserExport } from "@/rpc/authentication";

// Defines the schema for the input.
export const input = z.object({});

// Defines the schema for the output.
export const output = z.string();

// Defines the method that will be called.
export async function method(arg: z.infer<typeof input>, user: UserExport): Promise<z.infer<typeof output>> {
    return "Hello, world!";
}

// Defines if this is a mutation. Defaults to true if unset.
export const mutation = true;

// Defines if this should run in parallel in batch queries. Defaults to false if unset.
export const parallel = false;

// Defines if the user needs to be authenticated. Defaults to true if unset.
export const authenticated = true;
`;

const noAuthRoutePlaceholder = `import z from "zod";

// Defines the schema for the input.
export const input = z.object({});

// Defines the schema for the output.
export const output = z.string();

// Defines the method that will be called.
export async function method(arg: z.infer<typeof input>): Promise<z.infer<typeof output>> {
    return "Hello, world!";
}

// Defines if this is a mutation. Defaults to true if unset.
export const mutation = true;

// Defines if this should run in parallel in batch queries. Defaults to false if unset.
export const parallel = false;
`;

function searchNamespace(namespace: string[], lockfile: Lockfile, version: string) {
    let routes = lockfile.routes[version] as { [key: string]: any };
    const cpy = [...namespace];
    const methodName = cpy.pop()!;
    let namespaceChunk = cpy.shift();
    while (namespaceChunk) {
        if (!routes[namespaceChunk]) {
            routes[namespaceChunk] = {};
        }
        routes = routes[namespaceChunk];
        namespaceChunk = cpy.shift();

        if (typeof routes === "string") {
            error("A namespace cannot be a method.");
        }
    }
    return [routes, methodName] as const;
}

async function create(namespace: string[], versionInit: RPCVersionWithCache | undefined) {
    if (!versionInit) {
        const init = requiresRpcInit();
        const version = sortVersions(Object.keys(init.lockfile.routes)).pop();
        if (!version) {
            error("You need to create a API version first.");
        }
        versionInit = [init, version];
    }
    const [{ lockfile, rpcPath, repoFolderStructure }, version] = versionInit;

    const [routes, methodName] = searchNamespace(namespace, lockfile, version);
    if (routes[methodName]) {
        error("The method specified already exists. If you want to make a breaking change, use the break sub-command.");
    }

    const relPath = `./routes/${version}/${namespace.join("/")}.ts`;
    routes[methodName] = relPath.slice(0, -3);

    const absPath = join(rpcPath, relPath);
    const dir = dirname(absPath);
    mkdirSync(dir, { recursive: true });
    await Promise.all([
        // Create the file if it doesn't exist.
        stat(absPath).catch(() => {
            return writeFile(
                absPath,
                lockfile.hasAuthentication ?
                    authRoutePlaceholder :
                    noAuthRoutePlaceholder,
            );
        }),

        // Update the lockfile.
        writeFile(
            join(rpcPath, "index.ts"),
            stringify(lockfile),
        ),

        // Delete routes/.keep if it exists.
        unlink(join(rpcPath, "routes", ".keep")).catch(() => {}),
    ]);
    
    await regenerateNextState(repoFolderStructure, rpcPath);
    success("Method created.");
}

function _break(namespace: string[], versionInit: RPCVersionWithCache | undefined) {
    if (!versionInit) {
        const init = requiresRpcInit();
        const version = sortVersions(Object.keys(init.lockfile.routes)).pop();
        if (!version) {
            error("You need to create a API version first.");
        }
        versionInit = [init, version];
    }
    const [{ lockfile, rpcPath }, version] = versionInit;

    const [routes, methodName] = searchNamespace(namespace, lockfile, version);
    if (!routes[methodName]) {
        error("The method specified does not exist. If you want to create a new method, use the create sub-command.");
    }
    const relPath = routes[methodName];
    if (relPath.startsWith(`./routes/${version}/`)) {
        error("The method specified is already in the current API version. You need to bump the API version first before making a breaking change.");
    }

    const newRelPath = `./routes/${version}/${namespace.join("/")}.ts`;

    const newAbsPath = join(rpcPath, newRelPath);
    mkdirSync(dirname(newAbsPath), { recursive: true });

    const fileContents = readFileSync(join(rpcPath, relPath + ".ts"), "utf-8");
    writeFileSync(newAbsPath, fileContents);

    routes[methodName] = newRelPath.slice(0, -3);
    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );

    success("Method prepared for breaking change.");
}

async function drop(namespace: string[], versionInit: RPCVersionWithCache | undefined) {
    if (!versionInit) {
        const init = requiresRpcInit();
        const version = sortVersions(Object.keys(init.lockfile.routes)).pop();
        if (!version) {
            error("There are no API versions to drop the method from.");
        }
        versionInit = [init, version];
    }
    const [{ lockfile, rpcPath, repoFolderStructure }, version] = versionInit;

    let routes = lockfile.routes[version] as { [key: string]: any };
    const cpy = [...namespace];
    const methodName = cpy.pop()!;
    let namespaceChunk = cpy.shift();
    while (namespaceChunk) {
        if (!routes[namespaceChunk]) {
            error("The method specified does not exist.");
        }

        const nextRoute = routes[namespaceChunk];

        if (typeof nextRoute === "string") {
            error("A namespace cannot be a method.");
        }
        if (Object.keys(nextRoute).length === 1) {
            delete routes[namespaceChunk];
        }

        routes = nextRoute;
        namespaceChunk = cpy.shift();
    }

    if (!routes[methodName]) {
        error("The method specified does not exist.");
    }

    const relPath = routes[methodName];
    delete routes[methodName];

    const absPath = join(rpcPath, relPath + ".ts");
    await Promise.all([
        // Delete the file.
        unlink(absPath).catch(() => {}),

        // Update the lockfile.
        writeFile(
            join(rpcPath, "index.ts"),
            stringify(lockfile),
        ),
    ]);

    await regenerateNextState(repoFolderStructure, rpcPath);
    success("Method dropped.");
}

function namespaceParser(namespace: string) {
    const lower = namespace.trim().toLowerCase();
    if (lower === "batch" || lower === "batcher") {
        throw new InvalidArgumentError(`${lower} is a reserved name.`);
    }

    const s = lower.split(".");
    for (const part of s) {
        if (part === "") {
            throw new InvalidArgumentError("Blank namespace part.");
        }
        if (!part.match(/^[a-z][a-z0-9_]*$/i)) {
            throw new InvalidArgumentError("Invalid namespace.");
        }
    }
    return s;
}

export function methods(cmd: Command) {
    const root = cmd
        .description("Manages the methods of your RPC server.");

    root.command("create")
        .description("Creates a new method.")
        .addArgument(argumentWithParser("<name>", "The name of the method.", namespaceParser))
        .addArgument(argumentWithParser("[api version]", "The API version to create the method in.", versionParser))
        .action(create);

    root.command("break")
        .description("Creates a breaking change on a existing method.")
        .addArgument(argumentWithParser("<name>", "The name of the method.", namespaceParser))
        .addArgument(argumentWithParser("[api version]", "The API version to make the breaking change in.", versionParser))
        .action(_break);

    root.command("drop")
        .description("Drops a method.")
        .addArgument(argumentWithParser("<name>", "The name of the method.", namespaceParser))
        .addArgument(argumentWithParser("[api version]", "The API version to drop the method from.", versionParser))
        .action(drop);
}
