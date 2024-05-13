import type { Enum, Object, Signature } from "@arpc/client-gen";
import z from "zod";

export function getZodInputSignature(
    schema: z.ZodType<any, any, any>, enums: Enum[],
    objects: Object[], uniqueNames: Set<string>, getName: () => string,
): Signature {
    // Handle simple types.
    if (schema instanceof z.ZodString) return { type: "string" };
    if (schema instanceof z.ZodNumber) return { type: "number" };
    if (schema instanceof z.ZodBigInt) return { type: "bigint" };
    if (schema instanceof z.ZodBoolean) return { type: "boolean" };

    // Handle nullable.
    if (schema instanceof z.ZodNullable || schema instanceof z.ZodOptional) {
        return {
            type: "nullable",
            inner: getZodInputSignature(schema._def.innerType, enums, objects, uniqueNames, getName),
        };
    }

    // Handle arrays.
    if (schema instanceof z.ZodArray) {
        return {
            type: "array",
            inner: getZodInputSignature(schema._def.type, enums, objects, uniqueNames, getName),
        };
    }

    // Handle unions.
    if (schema instanceof z.ZodUnion) {
        const options: z.ZodType<any, any, any>[] = [];
        function parseOptions(union: z.ZodUnion<any>) {
            for (const option of union.options) {
                if (option instanceof z.ZodUnion) {
                    parseOptions(option);
                } else {
                    options.push(option);
                }
            }
        }
        parseOptions(schema);
        return {
            type: "union",
            inner: options.map(
                (option, index) => getZodInputSignature(
                    option, enums, objects, uniqueNames, () => `${getName()}Variant${index}`),
            ),
        };
    }

    // Handle maps.
    if (schema instanceof z.ZodRecord || schema instanceof z.ZodMap) {
        return {
            type: "map",
            key: getZodInputSignature(schema._def.keyType, enums, objects, uniqueNames, getName),
            value: getZodInputSignature(schema._def.valueType, enums, objects, uniqueNames, getName),
        };
    }

    // Handle custom objects.
    if (schema instanceof z.ZodObject) {
        // Build out the fields.
        const fields: { [key: string]: Signature } = {};
        for (const [shapeKey, shapeValue] of Object.entries(schema.shape)) {
            fields[shapeKey] = getZodInputSignature(
                shapeValue as z.ZodType<any, any, any>, enums, objects, uniqueNames,
                () => `${getName()}${shapeKey[0].toUpperCase()}${shapeKey.slice(1)}`,
            );
        }

        // Get the best non-conflicting name.
        const name = getName();
        let revision = 0;
        let fullName = name;
        const obj = { name: fullName, fields };
        while (uniqueNames.has(fullName)) {
            // Get this revision and check if it is the same.
            const existing = objects.find((o) => o.name === fullName);
            if (existing) {
                // It is a object and not a enum. See if the fields are the same.
                if (JSON.stringify(existing.fields) === JSON.stringify(fields)) {
                    // The fields are the same, so we can just reference it.
                    return { type: "object", key: fullName };
                }
            }

            // Try a new revision.
            revision++;
            fullName = `${name}V${revision}`;
        }

        // Push the object.
        objects.push(obj);

        // Return a reference to it.
        return { type: "object", key: fullName };
    }

    // Handle enums.
    // TODO

    // Handle literals.
    if (schema instanceof z.ZodNull || schema instanceof z.ZodUndefined) {
        return { type: "literal", value: null };
    }
    if (schema instanceof z.ZodLiteral) {
        return { type: "literal", value: schema.value };
    }

    // Throw an error if we don't know how to handle the type.
    throw new Error(`arpc doesn't support the type ${schema.constructor.name} yet`);
}
