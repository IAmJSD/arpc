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
        description = `// ${description.trim().split("\n").join("\n// ")}\n`;
    }

    return `${description}export class ${name} extends ${builtIn ? "BuiltInError" : "BaseException"} {}
_addException(${name});`;
}

class ClassGenerator {
    private _methods: string[] = [];

    addMethod(name: string, args: string, returnType: string | null, body: string | null, comment: string | null) {
        let commentFmt = "";
        if (comment) {
            commentFmt = `    // ${comment.trim().split("\n").join("\n    // ")}\n`;
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
            commentFmt = `// ${comment.trim().split("\n").join("\n// ")}\n`;
        }

        extendsCls = extendsCls ? ` extends ${extendsCls}` : "";
        const exportPrefix = exported ? "export " : "";

        return `${commentFmt}${exportPrefix}class ${name}${extendsCls} ${classBody}`;
    }
}

type ClientClassType = "batcher" | "root" | "batcherCat" | "rootCat";

const singleArgConstructor = (arg: string) => (cls: ClassGenerator) => {
    cls.addMethod("constructor", arg, null, null, null);
};

function categoryConstructor(typeOf: ClientClassType) {
    switch (typeOf) {
    case "batcherCat":
    case "batcher":
        return singleArgConstructor("private _batch: Batch[]");
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

    const keys = Object.keys(methods).sort();
    for (const key of keys) {
        const methodOrCat = methods[key];
        if (typeof methodOrCat.mutation !== "boolean") {
            // This is a category. Generate it and then add a getter.
            const clsName = `${name}${upperFirst(key)}`;
            cats.push(
                makeClientClass(clsName, null, methodOrCat as Methods,
                    typeOf === "batcher" || typeOf === "batcherCat" ? "batcherCat" : "rootCat",
                    categoryConstructor(typeOf), `${namespace === "" ? "" : `${namespace}.`}${key}`),
            );
            const arg = typeOf === "root" ? "this" : `this.${typeOf.startsWith("batcher") ? "_batch" : "_client"}`;

            let ignore = "";
            if (typeOf === "root") ignore = "// @ts-expect-error: The request method on this client is private.\n";

            cls.addMethod(`get ${key}`, "", clsName, `${ignore}return new ${clsName}(${arg});`, null);
        } else {
            const description = (methodOrCat as Method).description;    
            let input = "";
            let arg = "";

            if ((methodOrCat as Method).input !== null) {
                const i = (methodOrCat as Method).input!;
                input = `${i.name}: ${renderSignature(i.signature)}`;
                arg = `arg: ${i.name}, `;
            }
        
            // Handle the client return.
            if (typeOf === "root" || typeOf === "rootCat") {
                const body = `return this${typeOf === "root" ? "" : "._client"}.doRequest({
    ${arg}method: "${namespace === "" ? "" : `${namespace}.`}${key}",
    mutation: ${methodOrCat.mutation ? "true" : "false"},
});`;
                cls.addMethod(
                    `async ${key}`, input, `Promise<${renderSignature((methodOrCat as Method).output)}>`,
                    body, description,
                );
                continue;
            }

            // Handle the batcher return.
            const body = `this._batch.push({
    method: "${namespace === "" ? "" : `${namespace}.`}${key}",
    ${arg}mutation: ${methodOrCat.mutation ? "true" : "false"},
});`;
            cls.addMethod(key, input, "void", body, description);
        }
    }

    let prefix = cats.join("\n\n");
    if (prefix !== "") prefix += "\n\n";

    const suffix = typeOf === "batcher" ? "Batcher" : "Client";
    let extendsCls: string | null = null;
    switch (typeOf) {
    case "batcher":
        extendsCls = "BaseBatcher";
        break;
    case "root":
        extendsCls = `BaseClient<${name}Batcher>`;
        break;
    }
    return prefix + cls.generate(`${name}${suffix}`, extendsCls, description, typeOf === "root");
}

function generateClientConstructor(c: Client) {
    return (cls: ClassGenerator) => {
        
    };
}

function buildClient(c: Client) {
    const className = `API${c.apiVersion.toUpperCase()}`;
    const batcher = makeClientClass(className, null, c.methods, "batcher", () => {}, "");
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
