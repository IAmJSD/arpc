import type { Enum, Object, Signature } from "@arpc/client-gen";
import {
    Type, SourceFile, TypeChecker, isEnumDeclaration, Symbol,
} from "typescript";
import { dequotify } from "./helpers";

const typeSet = new Set([
    "string", "number", "bigint", "boolean",
]);

function postprocessOutputs(outputs: Signature[]): Signature {
    if (outputs.length === 1) {
        return outputs[0];
    }
    let nullable = false;

    // Handle wrapping the whole union in a nullable.
all:
    for (;;) {
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.type === "nullable") {
                nullable = true;
                outputs[i] = output.inner;
                continue all;
            }
            if (output.type === "literal" && output.value === null) {
                nullable = true;
                outputs.splice(i, 1);
                continue all;
            }
        }
        break;
    }

    if (nullable) {
        return { type: "nullable", inner: { type: "union", inner: outputs } };
    }

    return { type: "union", inner: outputs };
}

export function processTypeScriptReturnType(
    returnType: Type, typeChecker: TypeChecker, enums: Enum[],
    objects: Object[], uniqueNames: Set<string>, typeAliases: Map<string, string>,
    path: string[],
) {
    // Go through the return types and unwind them accordingly.
    function handleLiterals(s: string, a: Signature[]) {
        // Handle string literals.
        if (s.startsWith('"') || s.startsWith("'") || s.startsWith("`")) {
            const v = dequotify(s);
            const hasString = a.some((x) => x.type === "literal" && x.value === v);
            if (!hasString) {
                a.push({ type: "literal", value: v });
            }
            return;
        }

        // Handle number literals.
        if (!isNaN(Number(s))) {
            const v = Number(s);
            const hasNumber = a.some((x) => x.type === "literal" && x.value === v);
            if (!hasNumber) {
                a.push({ type: "literal", value: v });
            }
            return;
        }

        // Handle bigint literals.
        if (s.endsWith("n")) {
            const v = BigInt(s.slice(0, -1));
            const hasBigInt = a.some((x) => x.type === "literal" && x.value === v);
            if (!hasBigInt) {
                a.push({ type: "literal", value: v });
            }
            return;
        }

        // Handle boolean literals.
        if (s === "true" || s === "false") {
            // Convert to a boolean.
            const stob = s === "true";

            // Check if the opposite kind of boolean is already in the array.
            for (const v of a) {
                if (v.type === "boolean") {
                    // We already cover all cases. Return here.
                    return;
                }

                if (v.type === "literal") {
                    // Check if the type of this is a boolean.
                    if (typeof v.value === "boolean") {
                        // If it is the same, return right away.
                        if (v.value === stob) return;

                        // Since it is different, we need to change the type.
                        // Trick TypeScript since we are doing this in a non-type
                        // safe way, but more efficient one.
                        (v as any).type = "boolean";
                        delete (v as any).value;
                        return;
                    }
                }
            }

            // Add the boolean literal.
            a.push({ type: "literal", value: stob });
            return;
        }

        // Handle null or undefined literals.
        if (s === "null" || s === "undefined") {
            const hasNull = a.some((v) => v.type === "literal" && v.value === null);
            if (!hasNull) {
                a.push({ type: "literal", value: null });
            }
            return;
        }

        // Hmm, we don't know what this is. Throw an error.
        throw new Error(`Unknown literal type to arpc: ${s}`);
    }
    function processType(t: Type, a: Signature[], getName: () => string) {
        let s: string;
        let typeAlias: string | null = null;
        for (;;) {
            // Get the type as a string.
            s = typeChecker.typeToString(t);

            // Resolve any local type aliases.
            const a = typeAliases.get(s);
            if (a) {
                if (!typeAlias) {
                    typeAlias = s;
                }
                s = a;
            } else {
                break;
            }
        }

        // Handle unions.
        if (t.isUnion()) {
            const types = t.types;
            for (const type of types) {
                processType(type, a, getName);
            }
            return;
        }

        // Unwind promises.
        if (t.symbol?.escapedName === "Promise") {
            // @ts-ignore: This exists on the symbol.
            const types = t.typeArguments;
            if (types.length !== 1) {
                throw new Error("Promise type doesn't have one type argument.");
            }
            processType(types[0], a, getName);
            return;
        }

        // Handle maps.
        if (t.symbol?.escapedName === "Map") {
            // @ts-ignore: This exists on the symbol.
            const types = t.typeArguments;
            if (types.length !== 2) {
                throw new Error("Map type doesn't have two type arguments.");
            }

            let inner: Signature[] = [];
            processType(types[0], inner, () => `${typeAlias || getName()}Key`);
            const key = postprocessOutputs(inner);

            inner = [];
            processType(types[1], inner, () => `${typeAlias || getName()}Value`);
            const value = postprocessOutputs(inner);

            a.push({ type: "map", key, value });
            return;
        }

        // Handle records.
        if (t.symbol?.escapedName === "Record") {
            // @ts-ignore: This exists on the symbol.
            const types = t.typeArguments;
            if (types.length !== 2) {
                throw new Error("Record type doesn't have two type arguments.");
            }

            let inner: Signature[] = [];
            processType(types[0], inner, () => `${typeAlias || getName()}Key`);
            const key = postprocessOutputs(inner);

            inner = [];
            processType(types[1], inner, () => `${typeAlias || getName()}Value`);
            const value = postprocessOutputs(inner);

            a.push({ type: "map", key, value });
            return;
        }

        // Handle simple types.
        const l = s.toLowerCase();
        if (typeSet.has(l)) {
            a.push({ type: l as any });
            return;
        }

        // Handle processing literals.
        if (t.isLiteral()) {
            handleLiterals(s, a);
            return;
        }

        // Handle {[x: Y]: Z} types.
        const apparent = typeChecker.getApparentType(t);
        // @ts-ignore: TS doesn't have a good way to get the index infos.
        const indexInfos: { keyType: Type; valueType: Type }[] = apparent?.indexInfos;
        if (indexInfos) {
            if (indexInfos.length !== 1) {
                throw new Error("Index type doesn't have one index info.");
            }

            const { keyType, valueType } = indexInfos[0];

            let inner: Signature[] = [];
            processType(keyType, inner, () => `${typeAlias || getName()}Key`);
            const key = postprocessOutputs(inner);

            inner = [];
            processType(valueType, inner, () => `${typeAlias || getName()}Value`);
            const value = postprocessOutputs(inner);

            a.push({ type: "map", key, value });
            return;
        }

        // Handle objects.
        // @ts-ignore: TS doesn't have a good way to get the members.
        const members: Map<string, Symbol> = t.members;
        if (members) {
            // Defines where the fields are stored.
            const fields: { [key: string]: Signature } = {};

            for (const [name, sym] of members) {
                // Get the type.
                const symType = typeChecker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration!);

                // Process the type.
                const inner: Signature[] = [];
                processType(symType, inner, () => `${typeAlias || getName()}${name[0].toUpperCase()}${name.slice(1)}`);
                fields[name] = postprocessOutputs(inner);
            }

            // Get the revision.
            let revision = 0;
            let fullName = typeAlias || getName();
            while (uniqueNames.has(fullName)) {
                // Get this revision and check if it is the same.
                const existing = objects.find((o) => o.name === fullName);
                if (existing) {
                    // It is a object and not a enum. See if the fields are the same.
                    if (JSON.stringify(existing.fields) === JSON.stringify(fields)) {
                        // The fields are the same, so we can just reference it.
                        a.push({ type: "object", key: fullName });
                        return;
                    }
                }

                // Try a new revision.
                revision++;
                fullName = `${typeAlias || getName()}V${revision}`;
            }
            objects.push({ name: fullName, fields });
            a.push({ type: "object", key: fullName });
            return;
        }

        // Handle array types.
        if (typeChecker.isArrayLikeType(t) || typeChecker.isArrayType(t) || typeChecker.isTupleType(t)) {
            // @ts-ignore: TS doesn't have a good way to get the inner type.
            const inner = t.resolvedTypeArguments;
            if (!inner) {
                throw new Error("Array type doesn't have an inner type.");
            }
            for (const i of inner) {
                processType(i, a, getName);
            }
            return;
        }

        // Cut "readonly " from the start of the string.
        if (s.startsWith("readonly ")) {
            s = s.slice(9);
        }

        // Handle writing enums to the enums array.
        const alias = t.aliasSymbol;
        if (alias) {
            // Get the exports.
            const e = alias.exports;

            if (e) {
                // Process the values.
                const values = new Map<string, any>();
                const types: Signature[] = [];
                for (const [key, sym] of e) {
                    // Get the type of the symbol.
                    const symType = typeChecker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration!);
                    const inner: Signature[] = [];
                    processType(symType, inner, () => `${typeAlias || getName()}${(key as string)[0].toUpperCase()}${(key as string).slice(1)}`);
                    types.push(postprocessOutputs(inner));

                    // Set the value.
                    const x: Signature[] = [];
                    handleLiterals(typeChecker.symbolToString(sym), x);
                    values.set(key as string, x[0]);
                }

                // Get the revision.
                let revision = 0;
                let fullName = typeAlias || getName();
                while (uniqueNames.has(fullName)) {
                    // Get this revision and check if it is the same.
                    const existing = enums.find((e) => e.name === fullName);
                    if (existing) {
                        // It is a enum and not a object. See if the fields are the same.
                        if (JSON.stringify(existing.data) === JSON.stringify(values)) {
                            // The fields are the same, so we can just reference it.
                            a.push({ type: "enum_value", enum: fullName });
                            return;
                        }
                    }

                    // Try a new revision.
                    revision++;
                    fullName = `${typeAlias || getName()}V${revision}`;
                }
                enums.push({ name: fullName, valueType: postprocessOutputs(types), data: values });
                a.push({ type: "enum_value", enum: fullName });
            }
        }

        // Throw an error if we don't know what this is.
        throw new Error(`Unknown type to arpc: ${s}`);
    }
    const outputs: Signature[] = [];
    processType(returnType, outputs, () => path.map((x) => x[0].toUpperCase() + x.slice(1)).join("") + "Output");
    return postprocessOutputs(outputs);
}
