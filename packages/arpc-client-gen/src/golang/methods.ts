import type { Enum, Object, Method, Signature } from "../BuildData";
import { sortByObjectHeaviness } from "../helpers";
import { getReturnType } from "./returnTypes";

// Pushes the validator for the input.
function pushValidator(
	enums: Enum[], objects: Object[], name: string, signature: Signature, chunks: string[],
) {
	// TODO
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
		pushValidator(enums, objects, method.input.name, method.input.signature, chunks);
	}

	// Build the mutator.
	chunks.push("internalMutator := " + buildMutator(objects, method.output, "\t"));

	// Push the request build.
	chunks.push(`   reqBuildObj := request{
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
