import type { Enum, Object, Signature } from "@arpc-packages/client-gen";
import z from "zod";

export function getZodSignature(
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
            inner: getZodSignature(schema._def.innerType, enums, objects, uniqueNames, getName),
        };
    }

    // Handle arrays.
    if (schema instanceof z.ZodArray) {
        return {
            type: "array",
            inner: getZodSignature(schema._def.type, enums, objects, uniqueNames, getName),
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
                (option, index) => getZodSignature(
                    option, enums, objects, uniqueNames, () => `${getName()}Variant${index}`),
            ),
        };
    }

    // Handle maps.
    if (schema instanceof z.ZodRecord || schema instanceof z.ZodMap) {
        return {
            type: "map",
            key: getZodSignature(schema._def.keyType, enums, objects, uniqueNames, getName),
            value: getZodSignature(schema._def.valueType, enums, objects, uniqueNames, getName),
        };
    }

    // Handle custom objects.
    if (schema instanceof z.ZodObject) {
        // Build out the fields.
        const fields: { [key: string]: Signature } = {};
        for (const [shapeKey, shapeValue] of Object.entries(schema.shape)) {
            fields[shapeKey] = getZodSignature(
                shapeValue as z.ZodType<any, any, any>, enums, objects, uniqueNames,
                () => `${getName()}${shapeKey[0].toUpperCase()}${shapeKey.slice(1)}`,
            );
        }

        // Get the best non-conflicting name.
        const name = getName();
        let revision = 1;
        let fullName = name;
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
        uniqueNames.add(fullName);

        // Push the object.
        objects.push({ name: fullName, fields });

        // Return a reference to it.
        return { type: "object", key: fullName };
    }

    // Handle enums.
    if (schema instanceof z.ZodEnum) {
        const e = schema.Enum;
        const keys = Object.keys(e);
        const newEnum = new Map<any, any>();
        for (const key of keys) {
            newEnum.set(
                key.replaceAll(" ", "").replace(/[^a-zA-Z0-9_]/g, "_"),
                e[key],
            );
        }

        let valueType: Signature = { type: "string" };
        if (keys.length !== 0) {
            const types = ["string", "number", "bigint", "boolean"];
            const v = typeof e[keys[0]];
            if (!types.includes(v)) {
                throw new Error("Enums can only have string, number, bigint, or boolean values");
            }
            valueType = { type: v as any };
        }

        // Get the unique name.
        const name = getName();
        let revision = 1;
        let fullName = name;
        while (uniqueNames.has(fullName)) {
            // Get this revision and check if it is the same.
            const existing = enums.find((o) => o.name === fullName);
            if (existing) {
                // It is a enum. See if the data is the same.
                if (JSON.stringify(existing.data) === JSON.stringify(newEnum)) {
                    // The data is the same, so we can just reference it.
                    return { type: "enum_value", enum: fullName };
                }
            }

            // Try a new revision.
            revision++;
            fullName = `${name}V${revision}`;
        }
        uniqueNames.add(fullName);

        // Push the enum.
        enums.push({ name: fullName, valueType, data: newEnum });
        return { type: "enum_value", enum: fullName };
    }

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
