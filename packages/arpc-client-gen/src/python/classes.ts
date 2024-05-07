import type { Client, Enum, Method, Methods, Object, Signature } from "../BuildData";

// Renders the signature for a type.
function renderSignature(signature: Signature, enums: Enum[]) {
    // Handle the easy types.
    const v = typeMap[signature.type];
    if (v) return v;

    // Handle the nullable type.
    if (signature.type === "nullable") return `typing.Optional[${renderSignature(signature.inner, enums)}]`;

    // Handle the array type.
    if (signature.type === "array") return `typing.List[${renderSignature(signature.inner, enums)}]`;

    // Handle the union type.
    if (signature.type === "union") return `typing.Union[${signature.inner.map((x) => renderSignature(x, enums)).join(", ")}]`;

    // Handle the map type.
    if (signature.type === "map") return `typing.Dict[${renderSignature(signature.key, enums)}, ${renderSignature(signature.value, enums)}]`;

    // Handle the object type.
    if (signature.type === "object") return signature.key;

    // Handle the literal type.
    if (signature.type === "literal") {
        if (signature.value === null) return "None";
        let inner = signature.value;
        if (typeof inner === "string") inner = `"${inner}"`;
        else if (typeof inner === "boolean") inner = inner ? "True" : "False";
        return `typing.Literal[${inner}]`;
    }

    // Handle the enum key type.
    if (signature.type === "enum_key") return `typing.Literal[${Array.from(enums.find((x) => x.name === signature.enum)!.data.keys()).sort().map((x) => `"${x}"`).join(", ")}]`;

    // Handle the enum value type.
    if (signature.type === "enum_value") return `typing.Literal[${Array.from(enums.find((x) => x.name === signature.enum)!.data.keys()).sort().map((x) => `${signature.enum}.${x}`).join(", ")}]`;
}

// Handles the union mapping.
function unionMapping(signatures: Signature[], enums: Enum[]) {
    // Defines if any are nullable.
    let anyNullable = false;

    // Build a array of mutators.
    const mutators: string[] = [];
    for (let s of signatures) {
        if (s.type === "literal") {
            if (s.value === null) {
                // Null is nullable, obviously.
                anyNullable = true;
                continue;
            }

            // Literals are just a check.
            let literal = s.value;
            if (typeof literal === "string") literal = `"${literal}"`;
            else if (typeof literal === "boolean") literal = literal ? "True" : "False";
            mutators.push(`_is_eq(${literal})`);

            // Continue to the next.
            continue;
        }

        while (s.type === "nullable") {
            // This makes this nullable.
            anyNullable = true;

            // Get the inner.
            s = s.inner;
        }

        // Get the mutator.
        const m = getMutator(s, enums);
        if (m === "") {
            // Use the type mutator which is built in.
            mutators.push(`_is_type(${renderSignature(s, enums)})`);
        } else {
            // Add the mutator.
            mutators.push(m);
        }
    }

    // If it is nullable, prepend _is_none.
    if (anyNullable) mutators.unshift("_is_none");

    // Return the function.
    return `_process_union(${mutators.join(", ")})`;
}

// Handles the map mapping.
function mapMapping(key: Signature, value: Signature, enums: Enum[]) {
    const keyM = getMutator(key, enums);
    const valueM = getMutator(value, enums);

    if (keyM === "" && valueM === "") return "";
    return `_dict_mutations(${keyM === "" ? "None" : keyM}, ${valueM === "" ? "None" : valueM})`;
}

// Handles the enum value mutator.
function enumValueMutator(enumName: string, enums: Enum[]) {
    // Get the enum.
    const e = enums.find((x) => x.name === enumName);
    if (!e) throw new Error(`Enum ${enumName} not found.`);

    // Get the value mutator.
    return getMutator(e.valueType, enums);
}

// Gets the mutator based on the signature. Returns a blank string if there is no mutator.
function getMutator(signature: Signature, enums: Enum[]): string {
    // Resolve away any nullables.
    while (signature.type === "nullable") {
        signature = signature.inner;
    }

    // Switch on the type.
    let m: string;
    switch (signature.type) {
        case "array":
            // Handle if inners should be mutated.
            m = getMutator(signature.inner, enums);
            if (m === "") return "";
            return `_arr_mutations(${m})`;
        case "union":
            // Handle unions which are a bit more complex.
            return unionMapping(signature.inner, enums);
        case "map":
            // Handle any mutations in maps.
            return mapMapping(signature.key, signature.value, enums);
        case "object":
            // Objects have a _api_result method.
            return `${signature.key}._api_result`;
        case "enum_value":
            // Handles enum values.
            return enumValueMutator(signature.enum, enums);
        default:
            // No mutator.
            return "";
    }
}

// Handles the field init.
function handleFieldInit(key: string, signature: Signature, enums: Enum[]) {
    // Handle any mutators.
    const m = getMutator(signature, enums);
    if (m !== "") {
        return `
        self.${key} = ${m}(api_data.get("${key}"))`;
    }

    // The general case is to just set the field.
    return `
        self.${key} = api_data.get("${key}")`;
}

// Handle getting the Python type to type check a field.
function getPythonType(signature: Signature, enums: Enum[]) {
    const pythonType = typeMap[signature.type];
    if (pythonType) return pythonType;

    let e: Enum | undefined;
    switch (signature.type) {
    case "array":
        return "list";
    case "map":
        return "dict";
    case "enum_key":
        return "str";
    case "enum_value":
        e = enums.find((x) => x.name === signature.enum);
        if (!e) throw new Error(`Enum ${signature.enum} not found.`);
        return getPythonType(e.valueType, enums);
    case "literal":
        switch (typeof signature.value) {
        case "string":
            return "str";
        case "number":
        case "bigint":
            return "int";
        case "boolean":
            return "bool";
        }
    }
    return null;
}

// Make sure there are no brackets.
function noBrackets(s: string) {
    if (s.startsWith("(") && s.endsWith(")")) return s.slice(1, s.length - 1);
    return s;
}

// Handles checking the field for the object.
function checkField(key: string, signature: Signature, enums: Enum[]) {
    // Check if None is allowed for this field.
    let nullCheck = false;
    const checks: string[] = [];
    while (signature.type === "nullable") {
        nullCheck = true; 
        signature = signature.inner;
    }

    // Handle the type check.
    let x: any;
    switch (signature.type) {
    case "string":
    case "enum_key":
        checks.push(`not isinstance(o.${key}, str)`);
        break;
    case "number":
    case "bigint":
        checks.push(`not isinstance(o.${key}, int)`);
        break;
    case "boolean":
        checks.push(`not isinstance(o.${key}, bool)`);
        break;
    case "array":
        x = getMutator(signature.inner, enums);
        if (x === "") {
            // Handle mapping the Python type.
            const pythonType = getPythonType(signature.inner, enums);
            if (pythonType !== "") {
                checks.push(`(not isinstance(o.${key}, list) or any(not isinstance(x, ${pythonType}) for x in o.${key}))`);
            } else {
                // Just check it is a list.
                checks.push(`not isinstance(o.${key}, list)`);
            }
        } else {
            // Check it is a list. The mutator will handle the rest.
            checks.push(`not isinstance(o.${key}, list)`);
        }
        break;
    case "map":
        x = getMutator(signature, enums);
        if (x === "") {
            const pythonKey = getPythonType(signature.key, enums);
            const pythonValue = getPythonType(signature.value, enums);
            if (pythonKey !== "" && pythonValue !== "") {
                checks.push(`(not isinstance(o.${key}, dict) or any(not isinstance(k, ${pythonKey}) or not isinstance(v, ${pythonValue}) for k, v in o.${key}.items()))`);
            } else {
                // Just check it is a dict.
                checks.push(`not isinstance(o.${key}, dict)`);
            }
        } else {
            // Check it is a dict. The mutator will handle the rest.
            checks.push(`not isinstance(o.${key}, dict)`);
        }
        break;
    case "enum_value":
        x = getMutator(signature, enums);
        if (x === "") {
            // Handle mapping the Python type.
            const pythonType = getPythonType(signature, enums);
            if (pythonType !== "") {
                checks.push(`not isinstance(o.${key}, ${pythonType})`);
            }
        }
        break;
    case "literal":
        x = signature.value;
        if (typeof x === "string") x = `"${x}"`;
        else if (typeof x === "boolean") x = x ? "True" : "False";
        checks.push(`o.${key} != ${x}`);
        break;
    }

    // Make a return for the checks,
    if (checks.length === 0) return "";
    if (nullCheck) checks.push(`o.${key} is not None`);
    return `
        if ${noBrackets(checks.join(" and "))}:
            return None`;
}

// Creates a object.
export function createObject(object: Object, enums: Enum[]) {
    const orderedKeys = Object.keys(object.fields).sort();
    return `class ${object.name}(dict):${orderedKeys.map((key) => `\n    ${key}: ${renderSignature(object.fields[key], enums)}`).join("")}

    def __init__(self, api_data):
        super().__init__()${orderedKeys.map((key) => handleFieldInit(key, object.fields[key], enums)).join("")}

    def __setattr__(self, key, value):
        self[key] = value

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(f"Object has no attribute '{key}'")

    def __delattr__(self, key):
        try:
            del self[key]
        except KeyError:
            raise AttributeError(f"Object has no attribute '{key}'")

    @staticmethod
    def _api_result(api_data):
        if api_data is None:
            return None
        o = ${object.name}(api_data)${orderedKeys.map((key) => checkField(key, object.fields[key], enums)).join("")}
        return o`;
}

// Defines the init for the batcher.
const batcherInit = `    def __init__(self, client):
        super().__init__(client)`;

// Defines 1:1 mappings for some types.
const typeMap: { [key: string]: string } = {
    string: "str",
    number: "int",
    bigint: "int",
    boolean: "bool",
    null: "None",
};

// Renders the input.
const renderInput = (input: { name: string; signature: Signature }, enums: Enum[]) => `, ${input.name}: ${renderSignature(input.signature, enums)}`;

// Builds the function.
function buildFunction(
    async: boolean, fromClient: boolean, isClient: boolean,
    key: string, method: Method, route: string, enums: Enum[],
) {
    const mutator = getMutator(method.output, enums);
    let fn: string;
    if (fromClient) {
        const start = mutator === "" ? "" : `${mutator}(`;
        const end = mutator === "" ? "" : ")";
        fn = `return ${start}${async ? "await " : ""}${isClient ? "self" : "self._client"}._do_request(_Request(
            "${route}", ${method.mutation ? "True" : "False"}, ${method.input ? `${method.input.name}` : "None"}))${end}`;
    } else {
        const secondArg = mutator === "" ? "None" : mutator;
        fn = `self._batch.append((_Request(
            "${route}", ${method.mutation ? "True" : "False"}, ${method.input ? `${method.input.name}` : "None"}), ${secondArg}))`;
    }
    return `    ${async ? "async " : ""}def ${key}(self${method.input ? renderInput(method.input, enums) : ""}) -> ${fromClient && method.output ? renderSignature(method.output, enums) : "None"}:
        ${method.description === "" ? "" : `"""${method.description}"""\n        `}${fn}`;
}

// Builds the classes.
function buildClientClasses(
    name: string, suffix: string, base: string, async: boolean, fromClient: boolean,
    init: string | null, methods: Methods, description: string | null, isClient: boolean,
    namespace: string, enums: Enum[],
) {
    // Map the categories.
    const categoryMaps = new Map<string, string>();
    for (const key in methods) {
        const value = methods[key];
        if (value.description !== null && typeof value.description !== "string") {
            let attr = "client";
            if (!fromClient) {
                attr = "batch";
            }

            categoryMaps.set(key, buildClientClasses(
                `${isClient ? "_" : ""}${name}${key[0].toUpperCase()}${key.slice(1)}`, suffix, "object", async,
                fromClient, `    def __init__(self, ${attr}):
        """Sets up the category."""
        self._${attr} = ${attr}`, value as Methods, "", false, `${namespace}${namespace === "" ? key : "." + key}`, enums,
            ) + "\n\n\n");
        }
    }
    const sortedCatKeys = Array.from(categoryMaps.keys()).sort();
    const selfInits = sortedCatKeys.map((key) => {
        let input = "client";
        if (isClient) {
            input = "self";
        } else if (!fromClient) {
            input = "self._batch";
        }
        return `\n        self.${key} = ${isClient ? "_" : ""}${name}${key[0].toUpperCase()}${key.slice(1)}${suffix}(${input})`;
    }).join("");

    // Map the methods.
    const methodFunctions = new Map<string, string>();
    for (const key in methods) {
        const value = methods[key];
        if (value.description === null || typeof value.description === "string") {
            methodFunctions.set(key, buildFunction(async, fromClient, isClient, key, value as Method, `${namespace}${namespace === "" ? key : "." + key}`, enums));
        }
    }
    const sortedMethodKeys = Array.from(methodFunctions.keys()).sort();

    // Return the Python code for this class.
    return `${sortedCatKeys.map((k) => categoryMaps.get(k)).join("\n\n\n")}class ${name}${suffix}(${base}):${description ? `\n    """${description}"""` : ""}
${init || batcherInit}${selfInits}\n\n${sortedMethodKeys.map((k) => methodFunctions.get(k)).join("\n\n")}`;
}

// Builds the client.
export function buildClient(async: boolean, enums: Enum[], client: Client, init: (client: Client) => string) {
    // Build the batcher.
    const batcherClass = `_BatcherAPI${client.apiVersion.toUpperCase()}`;
    const batcher = buildClientClasses(
        batcherClass, "", "_BaseBatcher", false, false, null, client.methods, null, false, "", enums,
    );

    // Build the client.
    return batcher + "\n\n\n" + buildClientClasses(
        `API${client.apiVersion.toUpperCase()}`, "Client", "_BaseClient",
        async, true, init(client), client.methods, client.description, true, "", enums,
    ) + `

    def batcher(self) -> ${batcherClass}:
        """Returns the batcher for this client."""
        return ${batcherClass}(self)`;
}
