import type { Object, Signature, LiteralType } from "../BuildData";
import { sortByObjectHeaviness } from "../helpers";

// Defines the return type for a signature.
export type ReturnType = {
	type: string;
	comment?: string;
};

// Turn the return type into an array.
function arrRetType(ret: ReturnType) {
	ret.type = "[]" + ret.type;
	return ret;
}

// Handles union return types.
function unionRetType(inner: Signature[], objects: Object[]) {
	// Build the items.
	const itemSigs = sortByObjectHeaviness(inner.slice(), objects).map((x) => {
		return getReturnType(x, objects);
	});

	// Create the comment.
	const comment = `The return type is one of: ${itemSigs.map((x) => x.type).join(", ")}`;

	// Return the type.
	return {
		type: "any",
		comment,
	};
}

// Handle the map return type.
function mapRetType(key: Signature, value: Signature, objects: Object[]) {
	// Get the key and value types.
	const keyType = getReturnType(key, objects);
	const valueType = getReturnType(value, objects);

	// Handle the comments if they are set.
	const chunks: string[] = [];
	if (keyType.comment) chunks.push(keyType.comment.replace(
		/^The return type is /, "The key type is ",
	));
	if (valueType.comment) chunks.push(valueType.comment.replace(
		/^The return type is /, "The value type is ",
	));

	// Return the result.
	const mapType = `map[${keyType.type}]${valueType.type}`;
	if (chunks.length > 0) {
		return {
			type: mapType,
			comment: chunks.join("\n"),
		};
	}
	return { type: mapType };
}

// Defines the nullable return type.
function nullRetType(inner: Signature, objects: Object[]) {
	// Ensure we eat all the nulls.
	while (inner.type === "nullable") inner = inner.inner;

	// Get the return type.
	const ret = getReturnType(inner, objects);
	ret.type = `*${ret.type}`;
	return ret;
}

// Handle the literal return type.
function literalRetType(value: LiteralType): ReturnType {
	switch (typeof value) {
	case "string":
		return {type: "string"};
	case "number":
		return {type: "int"};
	case "bigint":
		return {type: "uint64"};
	case "boolean":
		return {type: "bool"};
	case "object":
		return {type: "*struct{}"};
	}
}

// Get the return type for a signature and a comment that clarifies it if needed.
export function getReturnType(sig: Signature, objects: Object[]): ReturnType {
	switch (sig.type) {
	case "array":
		return arrRetType(getReturnType(sig.inner, objects));
	case "bigint":
		return {type: "uint64"};
	case "boolean":
		return {type: "bool"};
	case "union":
		return unionRetType(sig.inner, objects);
	case "string":
	case "enum_key":
		return {type: "string"};
	case "map":
		return mapRetType(sig.key, sig.value, objects);
	case "nullable":
		return nullRetType(sig.inner, objects);
	case "number":
		return {type: "int"};
	case "object":
		return {type: sig.key};
	case "literal":
		return literalRetType(sig.value);
	case "enum_value":
		return {type: sig.enum};
	}
}
