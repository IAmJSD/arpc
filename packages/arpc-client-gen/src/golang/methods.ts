import type { Enum, Object, Method, Signature, LiteralType } from "../BuildData";
import { sortByObjectHeaviness } from "../helpers";
import { getReturnType, ReturnType } from "./returnTypes";

// Pushes a object validator.
function pushObjectValidator(
	output: ReturnType, enums: Enum[], objects: Object[], name: string, sigObject: string, chunks: string[],
	indent: string,
) {
	// Get the object.
	const obj = objects.find((x) => x.name === sigObject);
	if (!obj) throw new Error(`Could not find object ${sigObject}`);

	// Go through the keys and validate each thing where applicable.
	const keys = Object.keys(obj.fields).sort();
	for (const key of keys) {
		const attr = key.substring(0, 1).toUpperCase() + key.substring(1);
		const signature = obj.fields[key];
		pushValidator(enums, objects, `${name}.${attr}`, signature, chunks, indent, output);
	}
}

// Pushes a literal validator.
function pushLiteralValidator(outputType: string, name: string, value: LiteralType, chunks: string[], indent: string) {
	// Get the string value.
	let valueStr: string;
	switch (typeof value) {
	case "bigint":
		valueStr = value.toString();
		break;
	case "object":
		if (value) {
			// This should never happen.
			throw new Error("non-nil object literals are not supported");
		}
		valueStr = "nil";
		break;
	default:
		valueStr = JSON.stringify(value);
	}

	// Do the check.
	chunks.push(`${indent}if ${name} != ${valueStr} {
${indent}	var internalDefault ${outputType}
${indent}	return internalDefault, errors.New("literal value does not match")
${indent}}`);
}

// Pushes a union validator.
function pushUnionValidator(
	enums: Enum[], objects: Object[], name: string, inner: Signature[], chunks: string[], indent: string,
	output: ReturnType,
) {
	// Return now if there is nothing to validate.
	if (inner.length === 0) return;

	// Go through each inner type and validate it.
	chunks.push(`${indent}switch ${name}Inner := ${name}.(type) {`);
	const sorted = sortByObjectHeaviness(inner.slice(), objects);
	for (const signature of sorted) {
		const returnType = getReturnType(signature, objects);
		chunks.push(`${indent}case ${returnType.type}:`);
		pushValidator(enums, objects, name + "Inner", signature, chunks, indent + "\t", output);
	}
	chunks.push(`${indent}	break
${indent}default:
${indent}	var internalDefault ${output.type}
${indent}	return internalDefault, errors.New("union type is not present")
${indent}}`);
}

// Pushes the enum keys for the input.
function pushEnumKeyValidator(
	enums: Enum[], name: string, enumName: string, chunks: string[], indent: string,
	output: ReturnType,
) {
	// Get the enum.
	const enumObj = enums.find((x) => x.name === enumName);
	if (!enumObj) throw new Error(`Could not find enum ${enumName}`);

	// Check if the value is in the enum.
	const conditions = new Array(enumObj.data.keys()).sort();
	if (conditions.length === 0) {
		// Return early since there is nothing to push.
		return;
	}
	chunks.push(`${indent}switch ${name} {`);
	for (const condition of conditions) {
		chunks.push(`${indent}case ${JSON.stringify(condition)}:`);
	}
	chunks.push(`${indent}	break
${indent}default:
${indent}	var internalDefault ${output.type}
${indent}	return internalDefault, errors.New("enum key is not present")
${indent}}`);
}

// Pushes the validator for the input.
function pushValidator(
	enums: Enum[], objects: Object[], name: string, signature: Signature, chunks: string[],
	indent: string, output: ReturnType,
) {
	let newLen: number;
	switch (signature.type) {
	case "array":
		chunks.push(`${indent}for _, v := range ${name} {`);
		newLen = chunks.length;
		pushValidator(enums, objects, "v", signature, chunks, indent + "\t", output);
		if (newLen === chunks.length) {
			chunks.pop();
		} else {
			chunks.push(`${indent}}`);
		}
		return;
	case "nullable":
		chunks.push(`${indent}if ${name} != nil {`);
		newLen = chunks.length;
		pushValidator(enums, objects, "*" + name, signature, chunks, indent + "\t", output);
		if (newLen === chunks.length) {
			chunks.pop();
		} else {
			chunks.push(`${indent}}`);
		}
		return;
	case "map":
		chunks.push(`${indent}for k, v := range ${name} {`);
		newLen = chunks.length;
		pushValidator(enums, objects, "k", signature.key, chunks, indent + "\t", output);
		pushValidator(enums, objects, "v", signature.value, chunks, indent + "\t", output);
		if (newLen === chunks.length) {
			chunks.pop();
		} else {
			chunks.push(`${indent}}`);
		}
		return;
	case "object":
		return pushObjectValidator(output, enums, objects, name, signature.key, chunks, indent);
	case "literal":
		return pushLiteralValidator(output.type, name, signature.value, chunks, indent);
	case "union":
		return pushUnionValidator(enums, objects, name, signature.inner, chunks, indent, output);
	case "enum_key":
		return pushEnumKeyValidator(enums, name, signature.enum, chunks, indent, output);
	}
}

// Builds the mutator for the method.
function buildMutator(objects: Object[], output: Signature, indent: string): string {
	if (output.type === "union") {
		// In a union, we need to have many mutators which output the first successful.
		const sorted = sortByObjectHeaviness(output.inner.slice(), objects);
		const chunks = [];
		for (let i = 0; i < sorted.length; i++) {
			chunks.push(
				`	${indent}i${i} := ${buildMutator(objects, sorted[i], indent + "\t")}`,
			);
			chunks.push(`${indent}	if internalVal, internalErr := i${i}(val); internalErr == nil {
${indent}		return internalVal, nil
${indent}	}`);
		}
		chunks.push(`${indent}return nil, fmt.Errorf("failed to validate union")`);
		return `func(val []byte) (any, error) {
${chunks.join("\n")}
${indent}}`;
	}

	// Handle individual types.
	const returnType = getReturnType(output, objects);
	if (returnType.type === "any") {
		// If the type is any, we need to return the raw value.
		return `func(val []byte) (any, error) {
${indent}	return val, nil
${indent}}`;
	}

	// Handle the rest of the types by trying to unmarshal them.
	return `func(val []byte) (any, error) {
${indent}	var internalVal ${returnType.type}
${indent}	if internalErr := msgpack.Unmarshal(val, &internalVal); internalErr != nil {
${indent}		return nil, internalErr
${indent}	}
${indent}	return internalVal, nil
${indent}}`;
}

// Builds the methods that are exposed by the API.
export function buildApiMethod(
	enums: Enum[], objects: Object[], structName: string, key: string,
	namespace: string, method: Method, isClient: boolean,
): string {
	// Add the description.
	let description: string;
	if (method.description) {
		description = `${key} ${method.description.substring(0, 1).toLowerCase()}${method.description.substring(1)}`;
		description = description.split("\n")
			.map((line) => `// ${line}`)
			.join("\n");
	} else {
		description = `// ${key} is a method that is exposed by the API.`;
	}
	const outputType = getReturnType(method.output, objects);

	// Defines the chunks that will be used to build the method.
	const chunks = [description];

	// Add the method signature.
	let inputParam = isClient ? "ctx context.Context" : "";
	if (method.input) {
		// If there is a input, set the param.
		if (isClient) inputParam += ", ";
		inputParam += method.input.name + " " + getReturnType(method.input.signature, objects).type;
	}
	const outputResult = isClient ? ` (${outputType.type}, error)` : "";
	chunks.push(`func (c *${structName}) ${key}(${inputParam})${outputResult} {`);

	// If the input needs validating, do it here.
	if (method.input) {
		pushValidator(enums, objects, method.input.name, method.input.signature, chunks, "\t", outputType);
	}

	// Build the mutator.
	chunks.push("internalMutator := " + buildMutator(objects, method.output, "\t"));

	// Push the request build.
	chunks.push(`   reqBuildObj := &request{
		method:   ${JSON.stringify(namespace)},
		arg:	  ${method.input ? method.input.name : "nil"},
		mutation: ${method.mutation ? "true" : "false"},
		mutator:  internalMutator,
	}`);

	if (isClient) {
		// If this is a client, invoke the request handler.
		const cast = outputType.type === "any" ? "" : `.(${outputType.type})`;
		chunks.push(`   internalRes, internalErr := c.base.do(ctx, reqBuildObj)
	if internalErr != nil {
		var internalDefault ${outputType.type}
		return internalDefault, internalErr
	}
	return internalRes${cast}, nil`);
	} else {
		// If this is a batcher, append the request to the batch.
		chunks.push(`	*c.reqs = append(*c.reqs, reqBuildObj)`);
	}

	// Push the ending bracket.
	chunks.push("}");

	// Return the result joined.
	return chunks.join("\n");
}
