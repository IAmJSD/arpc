import { dirname, join, basename } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { test } from "@jest/globals";
import type { BuildData, Client, Object } from "./src/BuildData";

export function performGoldenTests(filename: string, goldenFile: string, fn: () => Promise<string>) {
    const goldenCat = basename(filename).split(".")[0];
    const folder = join(dirname(filename), "..", "testdata", goldenCat);
    goldenFile = `${goldenFile}.golden`;

    test(`validate equality with ${goldenCat}/${goldenFile}`, async () => {
        const golden = join(folder, goldenFile);

        const isUpdate = process.env.GOLDEN_UPDATE === "1";
        let goldenData: string | undefined;
        if (!isUpdate) {
            // Read the file.
            goldenData = await readFile(golden, "utf-8");
        }

        const result = await fn();

        if (isUpdate) {
            // Make all the directories.
            await mkdir(folder, { recursive: true });

            // Write the file.
            await writeFile(golden, result);
        } else {
            // Compare the result.
            expect(result).toBe(goldenData);
        }
    });
}

const clients: Client[] = [
    {
        apiVersion: "v1",
        authentication: null,
        defaultHostname: "example.com",
        defaultProtocol: "https",
        description: "This is API V1. Hello World!",
        methods: {
            root: {
                description: "This is a root function with a string returning a void.",
                input: { name: "name", signature: { type: "string" } },
                mutation: false,
                output: { type: "literal", value: null },
            },
            inputless: {
                description: "This is a inputless function returning a void.",
                input: null,
                mutation: false,
                output: { type: "literal", value: null },
            },
            echo: {
                number: {
                    description: "This is a echo function with a number returning a number.",
                    input: { name: "value", signature: { type: "number" } },
                    mutation: false,
                    output: { type: "number" },
                },
                itoa: {
                    description: "This is a echo function with a number returning a string.",
                    input: { name: "value", signature: { type: "number" } },
                    mutation: false,
                    output: { type: "string" },
                },
                boolean: {
                    description: "This is a echo function with a boolean returning a boolean.",
                    input: { name: "value", signature: { type: "boolean" } },
                    mutation: false,
                    output: { type: "boolean" },
                },
                hello: {
                    string: {
                        description: "This is a echo function with hello returning a string.",
                        input: { name: "value", signature: { type: "string" } },
                        mutation: true,
                        output: { type: "string" },
                    },
                    world: {
                        test: {
                            description: "Void function.",
                            input: null,
                            mutation: true,
                            output: { type: "literal", value: null },
                        },
                    },
                }
            },
        },
    },

    {
        apiVersion: "v2",
        defaultProtocol: "http",
        defaultHostname: "memes.com",
        description: "This is authentication without a default.",
        authentication: {
            tokenTypes: {
                BEARER: "Bearer",
                BOT: "Bot",
            },
        },
        methods: {},
    },

    {
        apiVersion: "v3",
        defaultProtocol: "http",
        defaultHostname: "memes.com",
        description: "This is authentication with a default.",
        authentication: {
            tokenTypes: {
                BEARER: "Bearer",
                BOT: "Bot",
            },
            defaultTokenType: "BEARER",
        },
        methods: {},
    },
];

const objects: Object[] = [
    {
        name: "Object1",
        fields: {
            name: { type: "string" },
            age: { type: "number" },
            id: { type: "bigint" },
            tags: {
                type: "array",
                inner: { type: "string" },
            },
            drainer: { type: "boolean" },
            home: {
                type: "nullable",
                inner: { type: "string" },
            },
            visited: {
                type: "map",
                key: { type: "string" },
                value: { type: "boolean" },
            },
            literals: {
                type: "union",
                inner: [
                    { type: "literal", value: "hello" },
                    { type: "literal", value: 1 },
                    { type: "literal", value: BigInt(1) },
                    { type: "literal", value: true },
                    { type: "literal", value: false },
                    { type: "literal", value: null },
                ],
            },
        },
    },
    {
        name: "Object2",
        fields: {
            one: {
                type: "object",
                key: "Object1",
            },
            nullable: {
                type: "nullable",
                inner: {
                    type: "object",
                    key: "Object1",
                },
            },
        },
    },
    {
        name: "Object3",
        fields: {
            object: {
                type: "union",
                inner: [
                    { type: "object", key: "Object1" },
                    { type: "object", key: "Object2" },
                ],
            }
        },
    },
];

export function runTests(filename: string, suffix: string, fn: (build: BuildData) => string) {
    const g = (f: string) => `${f}${suffix}`;

    performGoldenTests(filename, g("no_content"), async () => fn({
        enums: [],
        objects: [],
        builtinExceptions: [],
        customExceptions: [],
        clients: [],
    }));

    performGoldenTests(filename, g("enums"), async () => fn({
        enums: [
            {
                name: "StringEnum",
                valueType: { type: "string" },
                data: new Map([
                    ["HELLO", "Hi!"],
                    ["WOW", "XD"],
                ]),
            },
            {
                name: "NumberEnum",
                valueType: { type: "number" },
                data: new Map([
                    ["ONE", 1],
                    ["TWO", 2],
                ]),
            },
            {
                name: "BigIntEnum",
                valueType: { type: "bigint" },
                data: new Map([
                    ["ONE", BigInt(1)],
                    ["TWO", BigInt(2)],
                ]),
            },
            {
                name: "BooleanEnum",
                valueType: { type: "boolean" },
                data: new Map([
                    ["TRUE", true],
                    ["FALSE", false],
                ]),
            },
        ],
        objects: [
            {
                name: "EnumsObject",
                fields: {
                    key: { type: "enum_key", enum: "StringEnum" },
                    value: { type: "enum_value", enum: "StringEnum" },
                },
            },
        ],
        builtinExceptions: [],
        customExceptions: [],
        clients: [],
    }));

    performGoldenTests(filename, g("objects"), async () => fn({
        enums: [],
        objects,
        builtinExceptions: [],
        customExceptions: [],
        clients: [],
    }));

    performGoldenTests(filename, g("builtin_exceptions"), async () => fn({
        enums: [],
        objects: [],
        builtinExceptions: [
            {
                name: "TestException",
                description: "This is a exception.",
            },
            {
                name: "TestException2",
                description: "This is another exception.",
            },
        ],
        customExceptions: [],
        clients: [],
    }));

    performGoldenTests(filename, g("custom_exceptions"), async () => fn({
        enums: [],
        objects: [],
        builtinExceptions: [],
        customExceptions: [
            {
                name: "TestException",
                description: "This is a exception.",
            },
            {
                name: "TestException2",
                description: "This is another exception.",
            },
        ],
        clients: [],
    }));

    performGoldenTests(filename, g("clients"), async () => fn({
        enums: [],
        objects: [],
        builtinExceptions: [],
        customExceptions: [],
        clients,
    }));
}
