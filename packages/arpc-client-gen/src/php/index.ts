import type { BuildData, Enum, Object, Signature } from "../BuildData";
import header from "./header";

function buildDescription(description: string) {
    description = description.trim().replace(/\n/g, "\n    // ");
    if (description !== "") description = `\n    // ${description}\n`;

    return description;
}

function createEnum(e: Enum) {
    let start = "\n    {";
    if (e.data.size === 0) {
        start = " {";
    }

    let inner = Array.from(e.data.keys()).sort().map((key) => {
        let value = e.data.get(key);
        switch (typeof value) {
        case "string":
            value = `"${value}"`;
            break;
        case "boolean":
            value = value ? "true" : "false";
            break;
        }
        if (value === null) value = "null";

        return `
        const ${key} = ${value};`}).join("");

    if (inner !== "") inner += "\n";

    return `    abstract class ${e.name}${start}${inner}}`;
}

function phpDataAssign(signature: Signature, key: string, enums: Enum[]) {
    while (signature.type === "nullable") {
        signature = signature.inner;
    }

    switch (signature.type) {
    case "array":
    
    case "literal":
        switch (typeof signature.value) {
        case "string":
            return `$obj->${key} = "${signature.value}";`;
        case "boolean":
            return `$obj->${key} = ${signature.value ? "true" : "false"};`;
        default:
            return `$obj->${key} = ${signature.value};`;
        }
    case "object":
        return `$obj->${key} = ${signature.key}::try_from($data["${key}"]);
            if ($data["${key}"] !== null && $obj->${key} === null) {
                return null;
            }`;
    default:
        return `$obj->${key} = $data["${key}"];`;
    }
}

function createObject(o: Object, enums: Enum[]) {
    const keys = Object.keys(o.fields).sort();

    const types = keys.map((key) => {
        const field = o.fields[key];
        return `
        public ${phpSignature(field, enums)} $${key};`;
    }).join("");

    const items = keys.map((key) => {
        const field = o.fields[key];
        return `
            if (!isset($data["${key}"])) return null;
            ${phpDataAssign(field, key, enums)}
            ${phpCheck(field, enums)}`;
    }).join("");

    return `    class ${o.name} {${types}

        public static function try_from(?array $data): ?${o.name} {
            if ($data === null) return null;
            $obj = new ${o.name}();${items}
            return $obj;
        }
    }`;
}

function createException(
    name: string, description: string, builtIn: boolean,
    namespace: string,
) {
    description = buildDescription(description);

    if (builtIn) {
        return `${description}    class ${name} extends \\${namespace}\\Internal\\BuiltInError {}
    \\${namespace}\\Internal\\set_exception(${name}::class, true);`;
    }

    return `${description}    class ${name} extends BaseException {}
    \\${namespace}\\Internal\\set_exception(${name}::class, false);`;
}

export function php(data: BuildData, options: {namespace: string}) {
    let namespace = options.namespace;
    if (namespace.startsWith("\\")) namespace = namespace.slice(1);
    if (namespace.endsWith("\\")) namespace = namespace.slice(0, -1);

    const chunks = [header(namespace), `namespace ${namespace}
{`];

    for (const e of data.enums) {
        chunks.push(createEnum(e));
    }

    for (const o of data.objects) {
        chunks.push(createObject(o, data.enums));
    }

    for (const e of data.builtinExceptions) {
        chunks.push(createException(e.name, e.description, true, namespace));
    }

    for (const e of data.customExceptions) {
        chunks.push(createException(e.name, e.description, false, namespace));
    }

    for (const c of data.clients) {
        chunks.push(buildClient(data.enums, c));
    }

    return chunks.join("\n\n") + "\n\n}\n"; 
}
