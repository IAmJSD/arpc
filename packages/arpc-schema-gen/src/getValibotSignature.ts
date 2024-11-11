import type { Enum, Object, Signature } from "@arpc-packages/client-gen";
import type {
    BaseSchema, NullableSchema, OptionalSchema, ArraySchema, UnionSchema,
    LiteralSchema, MapSchema, ObjectSchema, EnumSchema,
} from "valibot";

const SIMPLE_TYPES = ["string", "number", "bigint", "boolean"] as const;

export function getValibotSignature(
    schema: BaseSchema<any, any, any>, enums: Enum[],
    objects: Object[], uniqueNames: Set<string>, getName: () => string,
): Signature {
    // Handle simple types.
    type SimpleType = typeof SIMPLE_TYPES[number];
    if (SIMPLE_TYPES.indexOf(schema.type as SimpleType) !== -1) {
        return { type: schema.type as SimpleType };
    }

    // Handle nullable.
    if (schema.type === "nullable" || schema.type === "optional") {
        return {
            type: "nullable",
            inner: getValibotSignature(
                (schema as NullableSchema<any, any> | OptionalSchema<any, any>).wrapped, enums, objects,
                uniqueNames, getName,
            ),
        };
    }

    // Handle arrays.
    if (schema.type === "array") {
        return {
            type: "array",
            inner: getValibotSignature(
                (schema as ArraySchema<any, any>).item, enums, objects, uniqueNames, getName,
            ),
        };
    }

    // Handle unions.
    if (schema.type === "union") {
        const options: BaseSchema<any, any, any>[] = [];
        function parseOptions(union: UnionSchema<any, any>) {
            for (const option of union.options) {
                if (option.type === "union") {
                    parseOptions(option);
                } else {
                    options.push(option);
                }
            }
        }
        parseOptions(schema as UnionSchema<any, any>);
        return {
            type: "union",
            inner: options.map(
                (option, index) => getValibotSignature(
                    option, enums, objects, uniqueNames, () => `${getName()}Variant${index}`),
            ),
        };
    }

    // Handle maps.
    if (schema.type === "map") {
        return {
            type: "map",
            key: getValibotSignature((schema as MapSchema<any, any, any>).key, enums, objects, uniqueNames, getName),
            value: getValibotSignature((schema as MapSchema<any, any, any>).value, enums, objects, uniqueNames, getName),
        };
    }

    // Handle custom objects.
    if (schema.type === "object") {
        // Build out the fields.
        const fields: { [key: string]: Signature } = {};
        for (const [shapeKey, shapeValue] of Object.entries((schema as ObjectSchema<any, any>).entries)) {
            fields[shapeKey] = getValibotSignature(
                shapeValue as BaseSchema<any, any, any>, enums, objects, uniqueNames,
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
    if (schema.type === "enum") {
        const e = (schema as EnumSchema<any, any>).enum;
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
    if (schema.type === "literal") {
        return { type: "literal", value: (schema as LiteralSchema<any, any>).literal };
    }

    // Throw an error if we don't know how to handle the type.
    throw new Error(`arpc doesn't support the type ${schema.type} yet`);
}
