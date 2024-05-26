import type { BuildData, Client, Enum, Object, Signature } from "../BuildData";
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

function getEnumValueType(enumName: string, enums: Enum[], prefix: string) {
    for (const e of enums) {
        if (e.name === enumName) {
            let res = getSignature(e.valueType, enums);
            if (!res.startsWith(prefix)) res = prefix + res;
            return res;
        }
    }
    throw new Error(`Enum ${enumName} not found.`);
}

function literal2type(literal: string | number | bigint | boolean | null) {
    switch (typeof literal) {
    case "string":
        return "string";
    case "number":
        return "int";
    case "bigint":
        return "int";
    case "boolean":
        return "bool";
    case "object":
        return "null";
    }
}

function handleUnionInSignature(sigs: Signature[], enums: Enum[], prefix: string) {
    const typeSet = new Set<string>();
    for (const s of sigs) {
        typeSet.add(getSignature(s, enums));
    }
    let v = Array.from(typeSet).join("|");
    if (!v.startsWith(prefix)) v = `${prefix}(${v})`;
    return v;
}

function getSignature(s: Signature, enums: Enum[]): string {
    // Handle nullable types.
    let prefix = "";
    while (s.type === "nullable") {
        prefix = "?";
        s = s.inner;
    }

    // Switch on the type.
    switch (s.type) {
    case "array":
        return `${prefix}array`;
    case "bigint":
        return `${prefix}int`;
    case "boolean":
        return `${prefix}bool`;
    case "enum_key":
        return `${prefix}string`;
    case "enum_value":
        return getEnumValueType(s.enum, enums, prefix);
    case "literal":
        return `${prefix}${literal2type(s.value)}`;
    case "map":
        // PHP is weird, a map is just an array with a specific structure.
        return `${prefix}array`;
    case "number":
        return `${prefix}int`;
    case "object":
        return `${prefix}${s.key}`;
    case "string":
        return `${prefix}string`;
    case "union":
        return handleUnionInSignature(s.inner, enums, prefix);
    }
}

function s(x: any) {
    if (typeof x === "bigint") return x.toString();
    return JSON.stringify(x);
}

function assignIfVarName(varName: string | null, inputSyn: string, code: string, prefix: string) {
    if (varName === null) return code;
    return `${code}
${prefix}${varName} = ${inputSyn};`;
}

function createConversionLogic(
    prefix: string, varName: string | null, inputSyn: string, sig: Signature,
    namespace: string, enums: Enum[], objects: Object[],
): string {
    // Unwrap nullables.
    let nullable = false;
    while (sig.type === "nullable") {
        nullable = true;
        sig = sig.inner;
    }

    // Create a branch on nullables.
    if (nullable) {
        let v = `${prefix}if (isset(${inputSyn}) && ${inputSyn} !== null) {
${createConversionLogic(prefix + "    ", varName, inputSyn, sig, namespace, enums, objects)}
${prefix}}`;
        if (varName !== null) {
            v += ` else {
${prefix}    ${varName} = null;
${prefix}}`;
        }
        return v;
    }

    // Switch on the type.
    switch (sig.type) {
    case "array":
        return assignIfVarName(varName, inputSyn, `${prefix}if (!isset(${inputSyn}) || !is_array(${inputSyn})) {
${prefix}    throw new \\Exception("INVALID_TYPE", "Expected an array.");
${prefix}}
${prefix}foreach (${inputSyn} as $key => $value) {
${prefix}    if (!is_numeric($key)) {
${prefix}        throw new \\Exception("INVALID_TYPE", "Expected a numeric key.");
${prefix}    }
${createConversionLogic(prefix + "    ", null, "$value", sig.inner, `${namespace}[]`, enums, objects)}
${prefix}}`, prefix);

    case "bigint":
    case "number":
        return assignIfVarName(varName, inputSyn, `${prefix}if (!isset(${inputSyn}) || !is_int(${inputSyn})) {
${prefix}    throw new \\Exception("INVALID_TYPE", "Expected an integer.");
${prefix}}`, prefix);

    case "boolean":
        return assignIfVarName(varName, inputSyn, `${prefix}if (!isset(${inputSyn}) || !is_bool(${inputSyn})) {
${prefix}    throw new \\Exception("INVALID_TYPE", "Expected a boolean.");
${prefix}}`, prefix);

    case "enum_key":
    case "string":
        return assignIfVarName(varName, inputSyn, `${prefix}if (!isset(${inputSyn}) || !is_string(${inputSyn})) {
${prefix}    throw new \\Exception("INVALID_TYPE", "Expected a string.");
${prefix}}`, prefix);

    case "enum_value":
        // Hard to validate. Just set it if applicable.
        return varName === null ? "" : `${prefix}${varName} = ${inputSyn};`;

    case "literal":
        return assignIfVarName(varName, inputSyn, `${prefix}if (${inputSyn} !== ${s(sig.value)}) {
${prefix}    throw new \\Exception("INVALID_TYPE", "Expected literal value.");
${prefix}}`, prefix);

    case "map":
        return assignIfVarName(varName, inputSyn, `${prefix}if (!isset(${inputSyn}) || !is_array(${inputSyn})) {
${prefix}    throw new \\Exception("INVALID_TYPE", "Expected an array.");
${prefix}}
${prefix}foreach (${inputSyn} as $key => $value) {
${createConversionLogic(prefix + "    ", null, "$key", sig.key, `${namespace}[K]`, enums, objects)}
${createConversionLogic(prefix + "    ", null, "$value", sig.value, `${namespace}[V]`, enums, objects)}
${prefix}}`, prefix);

    case "object":
        return varName ? `${prefix}${varName} = new ${sig.key}(${inputSyn});` : `${prefix}new ${sig.key}(${inputSyn});`;

    case "union":
        // Sort by the largest objects first. Use the length of fields to determine this.
        const items = sig.inner.slice().sort((a, b) => {
            if (a.type === "object" && b.type === "object") {
                // Get the objects.
                const aObj = objects.find((o) => o.name === a.key);
                const bObj = objects.find((o) => o.name === b.key);
                if (aObj && bObj) {
                    return Object.keys(bObj.fields).length - Object.keys(aObj.fields).length;
                }
            }
            return 0;
        });

        // Build a PHP friendly label.
        const label = namespace.replaceAll(/[\[\].]/g, "_");

        // Create the branches.
        const branches = items.map((item, index) => {
            const isLast = index === items.length - 1;
            if (!isLast) {
                return `${prefix}try {
${createConversionLogic(prefix + "    ", null, inputSyn, item, namespace, enums, objects)}
${prefix}    goto ${label};
${prefix}} catch (\\Exception $e) {}`;
            }
            return createConversionLogic(prefix, null, inputSyn, item, namespace, enums, objects);
        });

        // Return the branches with the jump.
        return assignIfVarName(varName, inputSyn, `${branches.join("\n\n")}

${prefix}${label}:`, prefix);
    }
}

function createObject(o: Object, enums: Enum[], objects: Object[]) {
    // Defines the chunks that will be joined together to make the object.
    const chunks = [`    class ${o.name}
    {`];

    // Handle any types in the fields.
    const keys = Object.keys(o.fields).sort();
    for (const key of keys) {
        const sig = getSignature(o.fields[key], enums);
        chunks.push(`        public ${sig} $${key};`);
    }

    if (keys.length === 0) {
        // Just put a blank constructor.
        chunks.push(`        public function __construct() {}`);
    } else {
        // Push a blank line from the fields.
        chunks.push("");

        // Begin the constructor.
        chunks.push(`        public function __construct(array $data)
        {`);
    
        // Push all of the conversion logic for the keys.
        for (const key of keys) {
            chunks.push(
                createConversionLogic("            ", `$this->${key}`, `$data['${key}']`, o.fields[key], key, enums, objects),
            );
        }

        // End the constructor.
        chunks.push(`        }`);
    }

    // End the object.
    chunks.push(`    }`);
    return chunks.join("\n");
}

function createClient(enums: Enum[], objects: Object[], client: Client) {
    // TODO
    return "";
}

export function php(data: BuildData, options: { namespace: string }) {
    let namespace = options.namespace;
    if (namespace.startsWith("\\")) namespace = namespace.slice(1);
    if (namespace.endsWith("\\")) namespace = namespace.slice(0, -1);

    const chunks = [header(namespace), `namespace ${namespace}
{`];

    for (const e of data.enums) {
        chunks.push(createEnum(e));
    }

    for (const o of data.objects) {
        chunks.push(createObject(o, data.enums, data.objects));
    }

    for (const e of data.builtinExceptions) {
        chunks.push(createException(e.name, e.description, true, namespace));
    }

    for (const e of data.customExceptions) {
        chunks.push(createException(e.name, e.description, false, namespace));
    }

    for (const c of data.clients) {
        chunks.push(createClient(data.enums, data.objects, c));
    }

    return chunks.join("\n\n") + "\n\n}\n"; 
}
