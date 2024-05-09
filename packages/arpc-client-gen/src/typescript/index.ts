import type { BuildData, Client, Enum, Method, Methods, Object, Signature } from "../BuildData";
import header from "./header";

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
    if (description !== "") {
        description = `/**
${description.trim().split("\n").join("\n// ")}
*/
`;
    }

    return `${description}export class ${name} extends ${builtIn ? "BuiltInError" : "BaseException"} {}
_addException(${name});`;
}

class ClassGenerator {
    private _methods: string[] = [];

    addMethod(name: string, args: string, returnType: string | null, body: string | null, comment: string | null) {
        let commentFmt = "";
        if (comment) {
            commentFmt = `    /**
    ${comment.trim().split("\n").join("\n    ")}
    */\n`;
        }

        returnType = returnType ? `: ${returnType}` : "";
        if (body === null) {
            this._methods.push(`${commentFmt}    ${name}(${args})${returnType} {}`);
            return;
        }

        const spaceAdded = body.split("\n").map((line) => `        ${line}`).join("\n");
        this._methods.push(`${commentFmt}    ${name}(${args})${returnType} {
${spaceAdded}
    }`);
    }

    generate(name: string, extendsCls: string | null, comment: string | null, exported: boolean) {
        let classBody = "{}";
        if (this._methods.length > 0) {
            classBody = `{
${this._methods.join("\n\n")}
}`;
        }

        let commentFmt = "";
        if (comment) {
            commentFmt = `/**
${comment.trim()}
*/
`;
        }

        extendsCls = extendsCls ? ` extends ${extendsCls}` : "";
        const exportPrefix = exported ? "export " : "";

        return `${commentFmt}${exportPrefix}class ${name}${extendsCls} ${classBody}`;
    }
}

type ClientClassType = "root" | "batcherCat" | "rootCat";

const singleArgConstructor = (arg: string) => (cls: ClassGenerator) => {
    cls.addMethod("constructor", arg, null, null, null);
};

function categoryConstructor(typeOf: ClientClassType) {
    switch (typeOf) {
    case "batcherCat":
        return () => {};
    case "rootCat":
    case "root":
        return singleArgConstructor("private _client: ReqDoer");
    default:
        throw new Error(`Unknown type of client category: ${typeOf}`);
    }
}

function upperFirst(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function makeClientClass(
    name: string, description: string | null, methods: Methods,
    typeOf: ClientClassType, constructorBuilder: (cls: ClassGenerator) => void,
    namespace: string,
): string {
    const cats: string[] = [];
    const cls = new ClassGenerator();
    constructorBuilder(cls);

    const suffix = typeOf.startsWith("batcher") ? "Batcher" : "Client";
    const keys = Object.keys(methods).sort();
    for (const key of keys) {
        const methodOrCat = methods[key];
        if (typeof methodOrCat.mutation !== "boolean") {
            // This is a category. Generate it and then add a getter.
            const clsName = `${name}${upperFirst(key)}`;
            cats.push(
                makeClientClass(clsName, null, methodOrCat as Methods,
                    typeOf === "batcherCat" ? "batcherCat" : "rootCat",
                    categoryConstructor(typeOf), `${namespace === "" ? "" : `${namespace}.`}${key}`),
            );
            let arg: string;
            switch (typeOf) {
            case "root":
                arg = "this";
                break;
            case "rootCat":
                arg = "this._client";
                break;
            default:
                arg = "";
            }

            let ignore = "";
            if (typeOf === "root") ignore = "// @ts-expect-error: The request method on this client is protected.\n";

            cls.addMethod(`get ${key}`, "", `${clsName}${suffix}`, `${ignore}return new ${clsName}${suffix}(${arg});`, null);
        } else {
            const description = (methodOrCat as Method).description;    
            let input = "";
            let arg = "arg: null, ";

            if ((methodOrCat as Method).input !== null) {
                const i = (methodOrCat as Method).input!;
                input = `${i.name}: ${renderSignature(i.signature)}, `;
                arg = `arg: ${i.name}, `;
            }
        
            // Handle the client return.
            if (typeOf === "root" || typeOf === "rootCat") {
                const body = `return this${typeOf === "root" ? "" : "._client"}._doRequest({
    ${arg}method: "${namespace === "" ? "" : `${namespace}.`}${key}",
    mutation: ${methodOrCat.mutation ? "true" : "false"},
}, abortSignal);`;
                cls.addMethod(
                    `async ${key}`, `${input}abortSignal?: AbortSignal`, `Promise<${renderSignature((methodOrCat as Method).output)}>`,
                    body, description,
                );
                continue;
            }

            // Handle the batcher return.
            const body = `return {
    method: "${namespace === "" ? "" : `${namespace}.`}${key}",
    ${arg}mutation: ${methodOrCat.mutation ? "true" : "false"},
};`;
            cls.addMethod(
                key, input.slice(0, -2), `Request<${renderSignature((methodOrCat as Method).output)}>`,
                body, description);
        }
    }

    let prefix = cats.join("\n\n");
    if (prefix !== "") prefix += "\n\n";

    let extendsCls: string | null = null;
    switch (typeOf) {
    case "root":
        extendsCls = `BaseClient<${name}Batcher>`;
        break;
    }
    return prefix + cls.generate(`${name}${suffix}`, extendsCls, description, typeOf === "root");
}

const hostnameSetup = (protocol: string, hostname: string, version: string) => `if (!hostname) {
    hostname = "${protocol}://${hostname}/";
}

super(hostname, "version=${version}", headers, API${version.toUpperCase()}Batcher);`;

function generateClientConstructor(c: Client) {
    return (cls: ClassGenerator) => {
        const auth = c.authentication;
        if (!auth) {
            // Return the hostname setup only.
            cls.addMethod("constructor", "hostname?: string", null, "const headers = {};\n" + hostnameSetup(
                c.defaultProtocol, c.defaultHostname, c.apiVersion, 
            ), null);
            return;
        }

        // Define the token type keys.
        const keys = Object.keys(auth.tokenTypes).sort();
        const union = keys.map((x) => `"${x}"`).join(" | ");

        // Defines the token type objects.
        let object = "const types = {\n";
        for (const key of keys.sort()) {
            object += `    "${key}": "${auth.tokenTypes[key]}",\n`;
        }
        object += "};";

        // Handle the token type.
        let args: string;
        let body: string;
        if (auth.defaultTokenType) {
            args = `token?: string, tokenType?: ${union}, hostname?: string`;
            body = `${object}
if (!tokenType) {
    tokenType = "${auth.defaultTokenType}";
}
const headers: {[key: string]: string} = {};
if (token) {
    headers.Authorization = types[tokenType] + " " + token;
}
${hostnameSetup(c.defaultProtocol, c.defaultHostname, c.apiVersion)}`;
        } else {
            args = `auth?: {token: string; tokenType: ${union}}, hostname?: string`;
            body = `${object}
const headers: {[key: string]: string} = {};
if (auth) {
    headers.Authorization = types[auth.tokenType] + " " + auth.token;
}
${hostnameSetup(c.defaultProtocol, c.defaultHostname, c.apiVersion)}`;
        }
        cls.addMethod("constructor", args, null, body, null);
    };
}

function buildClient(c: Client) {
    const className = `API${c.apiVersion.toUpperCase()}`;
    const batcher = makeClientClass(className, null, c.methods, "batcherCat", () => {}, "");
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
