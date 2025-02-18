import { runGoldenTests } from "./tests/utils/golden";
import { AtomicItem, validateAtomicItems } from "./atomic";
import type { HandlerMapping, UnauthenticatedRequestHandler } from "./schema";
import { string } from "valibot";
import { describe } from "vitest";

const routes: HandlerMapping<UnauthenticatedRequestHandler<any, any>> = {
    skibidi: {
        toilet: {
            input: string(),
            output: string(),
            method: async (input) => input,
        },
    },
};

// @ts-expect-error: Map.prototype.toJSON is not defined in the global scope.
Map.prototype.toJSON = function () {
    return Array.from(this.entries());
};

describe("validateAtomicItems", () => runGoldenTests(
    __dirname, __filename,
    [
        // Failure cases

        {
            testName: "not array",
            input: {},
        },
        {
            testName: "empty array",
            input: [],
        },
        {
            testName: "non-array in array",
            input: [
                "hello",
            ],
        },
        {
            testName: "empty array in array",
            input: [[]],
        },
        {
            testName: "invalid route",
            input: [
                ["skibidi.loo", "hello"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "invalid assignment with null",
            input: [
                ["skibidi.toilet", "hello", null],
            ],
        },
        {
            testName: "invalid assignment with empty array",
            input: [
                ["skibidi.toilet", "hello", []],
            ],
        },
        {
            testName: "invalid assignment with false array",
            input: [
                ["skibidi.toilet", "hello", [false, null]],
            ],
        },
        {
            testName: "invalid assignment with string array",
            input: [
                ["skibidi.toilet", "hello", ["abc", "def"]],
            ],
        },
        {
            testName: "invalid assignment with blank variable",
            input: [
                ["skibidi.toilet", "hello", ["", []]],
            ],
        },
        {
            testName: "invalid assignment with long array",
            input: [
                ["skibidi.toilet", "hello", ["abc", ["def"], "ghi"]],
            ],
        },
        {
            testName: "zero length array for set",
            input: [[[]]],
        },
        {
            testName: "null for set",
            input: [[null]],
        },
        {
            testName: "blank variable used in set operation",
            input: [
                [["", null]],
            ] satisfies AtomicItem[],
        },
        {
            testName: "blank array for non-set operation",
            input: [
                [[], "skibidi.toilet"],
            ],
        },
        {
            testName: "null for non-set operation",
            input: [
                [null, "skibidi.toilet"],
            ],
        },
        {
            testName: "undefined variable used",
            input: [
                [["var"], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "non-string variable used",
            input: [
                [[null], "skibidi.toilet"],
            ],
        },
        {
            testName: "non-string route with non-set atomic operation",
            input: [
                [["hello"], 123],
            ],
        },
        {
            testName: "invalid route with non-set atomic operation",
            input: [
                [["hello"], "skibidi.loo"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "blank string assignment",
            input: [
                ["skibidi.toilet", "test", ""],
            ] satisfies AtomicItem[],
        },
        {
            testName: "maths op pointing to invalid handler var",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["varx", "var2", 1, "="], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "maths op with invalid comparison var",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "varx", 1, "="], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "maths op with too long array",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var", 1, "=", 1, 2], "skibidi.toilet"],
            ],
        },
        {
            testName: "maths op with invalid operator",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var", 1, "XD"], "skibidi.toilet"],
            ],
        },
        {
            testName: "maths op with non-string operator",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var", 1, {}], "skibidi.toilet"],
            ],
        },
        {
            testName: "maths op with invalid pluck",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var", 1, "=", null], "skibidi.toilet"],
            ],
        },
        {
            testName: "invalid argument as input",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [[1, "var2", 1, "=", ["abc", "def"]], "skibidi.toilet"],
            ],
        },
        {
            testName: "invalid second argument",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", 1, 1, "=", ["abc", "def"]], "skibidi.toilet"],
            ],
        },
        

        // Success cases

        {
            testName: "basic single",
            input: [
                ["skibidi.toilet", "hello"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "basic single with assignment",
            input: [
                ["skibidi.toilet", "hello", "rizz"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "basic single with assignment and pluck",
            input: [
                ["skibidi.toilet", "hello", ["rizz", ["abc", "def"]]],
            ] satisfies AtomicItem[],
        },
        {
            testName: "basic set",
            input: [
                [["var", 1]],
            ] satisfies AtomicItem[],
        },
        {
            testName: "basic set with usage",
            input: [
                [["var", 1]],
                [["var"], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "variable used in assignment",
            input: [
                ["skibidi.toilet", "hello", "var"],
                [["var"], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths > op",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, ">"], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths > op with asignment",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, ">"], "skibidi.toilet", "var3"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths >= op",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, ">="], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths >= op with asignment",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, ">="], "skibidi.toilet", "var3"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths = op",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, "="], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths = op with asignment",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, "="], "skibidi.toilet", "var3"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths ! op",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, "!"], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "simple maths ! op with asignment",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, "!"], "skibidi.toilet", "var3"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "maths op with pluck",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, "=", ["abc", "def"]], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "maths op with pluck and assignment",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [["var", "var2", 1, "=", ["abc", "def"]], "skibidi.toilet", ["var3", ["abc", "def"]]],
            ] satisfies AtomicItem[],
        },
        {
            testName: "constant argument as input",
            input: [
                [["var", 1]],
                [["var2", 1]],
                [[[1], "var2", 1, "=", ["abc", "def"]], "skibidi.toilet"],
            ] satisfies AtomicItem[],
        },
        {
            testName: "pluck and return not to variable",
            input: [
                ["skibidi.toilet", "hello", [null, ["abc", "def"]]],
            ] satisfies AtomicItem[],
        },
    ],
    async (x: any) => validateAtomicItems(x, routes),
));
