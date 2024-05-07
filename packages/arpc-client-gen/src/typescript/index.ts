import type { BuildData, Client, Enum, Method, Methods, Object, Signature } from "../BuildData";
import header from "./header";

function formatDescription(description: string | null, indent?: string) {
    if (description === null) return "";
    description = description.trim().replace(/\n/g, `\n${indent ?? ""}// `);
    if (description !== "") description = `// ${description}\n`;

    return description;
}

function createEnum(e: Enum) {
    let inner = Array.from(e.data.keys()).sort().map((key) => {
        let value = e.data.get(key);
        switch (typeof value) {
        case "string":
            value = `"${value}"`;
            break;
        case "boolean":
            value = value ? "true" : "false";
            break;
        case "bigint":
            value = `${value}n`;
            break;
        }
        if (value === null) value = "null";

        return `\n    ${key} = ${value};`;
    }).join("");
    if (inner !== "") inner += "\n";

    return `export enum ${e.name} {${inner}}`;
}

function renderSignature(signature: Signature): string {
    switch (signature.type) {
    case "array":
        return `${renderSignature(signature.inner)}[]`;
    case "bigint":
        return "bigint";
    case "boolean":
        return "boolean";
    case "enum_key":
        return `keyof typeof ${signature.enum}`;
    case "enum_value":
        return signature.enum;
    case "literal":
        let value = signature.value;
        switch (typeof value) {
        case "string":
            value = `"${value}"`;
            break;
        case "boolean":
            value = value ? "true" : "false";
            break;
        case "bigint":
            value = `${value}n`;
            break;
        }
        if (value === null) value = "null";
        return `${value}`;
    case "map":
        return `{[key: ${renderSignature(signature.key)}]: ${renderSignature(signature.value)}}`;
    case "nullable":
        return `${renderSignature(signature.inner)} | null`;
    case "number":
        return "number";
    case "object":
        return signature.key;
    case "string":
        return "string";
    case "union":
        return signature.inner.map(renderSignature).join(" | ");
    }
}

function createObject(obj: Object) {
    const keys = Object.keys(obj.fields).sort();
    let inner = keys.map((key) => {
        const signature = obj.fields[key];
        return `\n    ${key}: ${renderSignature(signature)};`;
    }).join("");
    if (inner !== "") inner += "\n";

    return `export type ${obj.name} = {${inner}};`;
}

function createException(name: string, description: string, builtIn: boolean) {
    description = formatDescription(description);
    return `${description}export class ${name} extends ${builtIn ? "BuiltInError" : "BaseException"} {}
_addException(${name});`;
}

function makeClientClass(
    name: string, description: string | null, methods: Methods,
    typeOf: "batcher" | "root" | "batcherCat" | "rootCat", constructorInner: () => string,
    namespace: string,
): string {
    let extend: string;
    switch (typeOf) {
    case "batcher":
        extend = " extends BaseBatcher";
        break;
    case "root":
        extend = `extends BaseClient<${name}Batcher>`;
        break;
    default:
        extend = "";
    }

    const keys = Object.keys(methods).sort();
    const cats: string[] = [];
    let inner = keys.map((key) => {
        const methodOrCat = methods[key];
        if (typeof methodOrCat.mutation !== "boolean") {
            // This is a category. Generate it and then add a getter.

            cats.push(
                makeClientClass(`${name}${key}`, null, methodOrCat as Methods,
                    typeOf === "batcher" || typeOf === "batcherCat" ? "batcherCat" : "rootCat",
                    categoryInit, `${namespace === "" ? "" : `${namespace}.`}${key}`),
            );
            return `
    get ${key}(): ${name}${key} {
        return new ${name}${key}(${typeOf === "root" ? "this" : "this._client"});
    }`;
        } else {
            const description = (methodOrCat as Method).description;
            let input = "";
            let arg = "";
            
            // Handle the client return.
            if (typeOf === "root" || typeOf === "rootCat") return `
    ${description}async ${key}(${input}): Promise<${renderSignature((methodOrCat as Method).output)}> {
        return this${typeOf === "root" ? "" : "._client"}.doRequest({
            ${arg}method: "${namespace === "" ? "" : `${namespace}.`}${key}",
            mutation: ${methodOrCat.mutation ? "true" : "false"},
        });
    }`;

            
        }
    }).join("");

    const suffix = typeOf === "batcher" ? "Batcher" : "Client";
    return `${formatDescription(description)}class ${name}${suffix}${extend} {
${constructor}${inner}
}`;
}

function generateClientConstructor(c: Client): string {

}

function buildClient(c: Client) {
    const className = `API${c.apiVersion.toUpperCase()}`;
    const batcher = makeClientClass(className, c.description, c.methods, "batcher");
    const client = makeClientClass(className, c.description, c.methods, "root", generateClientConstructor(c), "");

    return `${batcher}\n\n${client}`;
}

export function typescript(data: BuildData) {
    const chunks = [header];

    for (const e of data.enums) {
        chunks.push(createEnum(e));
    }

    for (const o of data.objects) {
        chunks.push(createObject(o));
    }

    for (const e of data.builtinExceptions) {
        chunks.push(createException(e.name, e.description, true));
    }

    for (const e of data.customExceptions) {
        chunks.push(createException(e.name, e.description, false));
    }

    for (const c of data.clients) {
        chunks.push(buildClient(c));
    }

    return chunks.join("\n\n") + "\n"; 
}
