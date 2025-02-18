import { decode, encode } from "@msgpack/msgpack";
import { RPCRouter } from "./router";
import { GoldenItem, runGoldenTests } from "./tests/utils/golden";
import { array, null as Null, nullable, number, object, string } from "valibot";
import { useRequest } from "./helpers";
import { useCommit, useRollback } from "./transactions";
import { test, describe } from "vitest";
import { Ratelimited } from "./ratelimiting";

type GoldenInput = {
    url: string;
    headers: Record<string, string>;
    get: boolean;
    body: any;
    before?: () => void;
    after?: () => void;
};

// Defines a lookup table for URL encoding.
const lookup = ["%00", "%01", "%02", "%03", "%04", "%05", "%06", "%07", "%08", "%09", "%0A", "%0B", "%0C", "%0D", "%0E", "%0F", "%10", "%11", "%12", "%13", "%14", "%15", "%16", "%17", "%18", "%19", "%1A", "%1B", "%1C", "%1D", "%1E", "%1F", "%20", "%21", "%22", "%23", "%24", "%25", "%26", "%27", "%28", "%29", "%2A", "%2B", "%2C", "%2D", "%2E", "%2F", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "%3A", "%3B", "%3C", "%3D", "%3E", "%3F", "%40", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "%5B", "%5C", "%5D", "%5E", "%5F", "%60", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "%7B", "%7C", "%7D", "%7E", "%7F", "%80", "%81", "%82", "%83", "%84", "%85", "%86", "%87", "%88", "%89", "%8A", "%8B", "%8C", "%8D", "%8E", "%8F", "%90", "%91", "%92", "%93", "%94", "%95", "%96", "%97", "%98", "%99", "%9A", "%9B", "%9C", "%9D", "%9E", "%9F", "%A0", "%A1", "%A2", "%A3", "%A4", "%A5", "%A6", "%A7", "%A8", "%A9", "%AA", "%AB", "%AC", "%AD", "%AE", "%AF", "%B0", "%B1", "%B2", "%B3", "%B4", "%B5", "%B6", "%B7", "%B8", "%B9", "%BA", "%BB", "%BC", "%BD", "%BE", "%BF", "%C0", "%C1", "%C2", "%C3", "%C4", "%C5", "%C6", "%C7", "%C8", "%C9", "%CA", "%CB", "%CC", "%CD", "%CE", "%CF", "%D0", "%D1", "%D2", "%D3", "%D4", "%D5", "%D6", "%D7", "%D8", "%D9", "%DA", "%DB", "%DC", "%DD", "%DE", "%DF", "%E0", "%E1", "%E2", "%E3", "%E4", "%E5", "%E6", "%E7", "%E8", "%E9", "%EA", "%EB", "%EC", "%ED", "%EE", "%EF", "%F0", "%F1", "%F2", "%F3", "%F4", "%F5", "%F6", "%F7", "%F8", "%F9", "%FA", "%FB", "%FC", "%FD", "%FE", "%FF"];

function urlencode(a: Uint8Array) {
    let ret = "";
    for (let i = 0; i < a.length; ++i) {
        ret += lookup[a[i]];
    }
    return ret;
}

async function rpcResponseToString(res: Response) {
    let respText = `=== STATUS ${res.status} - HEADERS ===\n\n`;
    for (const [key, value] of res.headers.entries()) {
        respText += `${key}: ${value}\n`;
    }
    if (res.status === 204) {
        respText += "\n=== NO CONTENT ===\n";
    } else {
        const body = await decode(new Uint8Array(await res.arrayBuffer()));
        respText += "\n=== MSGPACK BODY ===\n\n" + JSON.stringify(body, null, 4) + "\n";
    }
    return respText;
}

const _invalidMsgpack = Symbol("invalid msgpack");
const _invalidEncoding = Symbol("invalid encoding");
const _missingArg = Symbol("missing arg");

function rpcRouterGolden<User, AuthSet>(
    rpc: RPCRouter<any, any, any, any, User, AuthSet>,
    tests: GoldenItem<GoldenInput>[], useIt?: boolean,
) {
    const handler = rpc.buildHttpHandler();
    return runGoldenTests(
        __dirname, __filename, tests,
        async (input) => {
            let bodyEnc: Uint8Array | undefined = [_invalidMsgpack, _invalidEncoding, _missingArg].includes(input.body) ?
                new Uint8Array([0x69, 0x21, 0x69, 0x21]) :
                encode(input.body);
            if (input.get) {
                // Encode the body and then make it undefined.
                let e = urlencode(bodyEnc);
                if (input.body === _invalidEncoding) {
                    e = "%";
                }
                bodyEnc = undefined;

                // Add it to the URL.
                if (input.body !== _missingArg) {
                    input.url += "&arg=" + e;
                }
            }

            // Make the request.
            const req = new Request(input.url, {
                method: input.get ? "GET" : "POST",
                headers: input.headers,
                body: bodyEnc,
            });
            try {
                input.before?.();
                const res = await handler(req);
                return rpcResponseToString(res);
            } finally {
                input.after?.();
            }
        }, true, useIt ? undefined : test,
    );
}

const basicUnauthedRpc = new RPCRouter().setRoutes({
    v1: {
        request: {
            input: Null(),
            output: nullable(string()),
            method: async () => {
                const req = useRequest();
                return req.headers.get("X-Is-Skibidi");
            },
        },
        echo: {
            string: {
                input: string(),
                output: string(),
                method: async (input: string) => input,
            },
            number: {
                input: number(),
                output: number(),
                method: async (input: number) => input,
            },
            null: {
                input: Null(),
                output: Null(),
                method: async () => null,
            },
        },
        throws: {
            input: Null(),
            output: Null(),
            method: async () => {
                throw new Error("This is a test error");
            },
        },
        throwsParallel: {
            input: Null(),
            output: Null(),
            parallel: true,
            method: async () => {
                throw new Error("This is a test error");
            },
        },
        commit: {
            input: Null(),
            output: Null(),
            method: async () => {
                useCommit(async () => {
                    global.commitCount++;
                });
                if (global.commitCount !== 0) {
                    throw new Error("commitCount was not 0");
                }
                return null;
            },
        },
        throwInCommit: {
            input: Null(),
            output: Null(),
            method: async () => {
                useCommit(async () => {
                    throw new Error("This is a test error");
                });
                useCommit(async () => {
                    global.commitCount++;
                });
                if (global.commitCount !== 0) {
                    throw new Error("commitCount was not 0");
                }
                return null;
            },
        },
        rollback: {
            input: Null(),
            output: Null(),
            method: async () => {
                useRollback(async () => {
                    global.rollbackCount++;
                });
                throw new Error("This is a test error");
            },
        },
        rollbackThrows: {
            input: Null(),
            output: Null(),
            method: async () => {
                useRollback(async () => {
                    throw new Error("This is a test error");
                });
                throw new Error("This is a test error");
            },
        },
        object: {
            input: Null(),
            output: object({
                oneDeep: object({
                    string: string(),
                    array: array(string()),
                    number: number(),
                }),
            }),
            method: async () => ({ oneDeep: { string: "hello", array: ["world"], number: 2 } }),
        },
        number: {
            input: Null(),
            output: number(),
            method: async () => 2,
        },
    },
});

rpcRouterGolden(
    basicUnauthedRpc,
    [
        // Error cases

        {
            testName: "missing arg",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: true,
                body: _missingArg,
            },
        },
        {
            testName: "missing route",
            input: {
                url: "https://example.com/api/rpc?version=v1",
                headers: {},
                get: true,
                body: null,
            },
        },
        {
            testName: "missing version",
            input: {
                url: "https://example.com/api/rpc?route=request",
                headers: {},
                get: true,
                body: null,
            },
        },
        {
            testName: "invalid version",
            input: {
                url: "https://example.com/api/rpc?version=v0&route=request",
                headers: {},
                get: true,
                body: null,
            },
        },
        {
            testName: "invalid route",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=request-does-not-exist",
                headers: {},
                get: true,
                body: null,
            },
        },
        {
            testName: "invalid param encoding",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: true,
                body: _invalidEncoding,
            },
        },
        {
            testName: "invalid query string",
            input: {
                url: "https://example.com/api/rpc",
                headers: {},
                get: true,
                body: null,
            },
        },
        {
            testName: "invalid get msgpack",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: true,
                body: _invalidMsgpack,
            },
        },
        {
            testName: "invalid post msgpack",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: false,
                body: _invalidMsgpack,
            },
        },
        {
            testName: "get internal server error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=throws",
                headers: {},
                get: true,
                body: null,
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "get atomic non-parallel multiple internal server error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: true,
                body: [
                    ["throws", null],
                    ["throws", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "get atomic parallel multiple internal server error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: true,
                body: [
                    ["throwsParallel", null],
                    ["throwsParallel", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 2) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "post atomic non-parallel multiple internal server error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["throws", null],
                    ["throws", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "post atomic parallel multiple internal server error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["throwsParallel", null],
                    ["throwsParallel", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 2) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "post internal server error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=throws",
                headers: {},
                get: true,
                body: null,
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "throw in commit",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=throwInCommit",
                headers: {},
                get: false,
                body: null,
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.commitCount = 0;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const timeoutCount = global.timeoutCount;
                    delete global.timeoutCount;
                    if (timeoutCount !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                    const commitCount = global.commitCount;
                    delete global.commitCount;
                    if (commitCount !== 0) {
                        throw new Error("commitCount was not 0");
                    }
                },
            },
        },
        {
            testName: "non-atomic rollback works",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=rollback",
                headers: {},
                get: false,
                body: null,
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.rollbackCount = 0;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const timeoutCount = global.timeoutCount;
                    delete global.timeoutCount;
                    if (timeoutCount !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                    const rollbackCount = global.rollbackCount;
                    delete global.rollbackCount;
                    if (rollbackCount !== 1) {
                        throw new Error("rollbackCount was not 1");
                    }
                },
            },
        },
        {
            testName: "atomic rollback works",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["rollback", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.rollbackCount = 0;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const timeoutCount = global.timeoutCount;
                    delete global.timeoutCount;
                    if (timeoutCount !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                    const rollbackCount = global.rollbackCount;
                    delete global.rollbackCount;
                    if (rollbackCount !== 1) {
                        throw new Error("rollbackCount was not 1");
                    }
                },
            },
        },
        {
            testName: "atomic rollback throws",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["rollbackThrows", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "non-atomic rollback throws",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=rollbackThrows",
                headers: {},
                get: false,
                body: null,
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "bad atomic request",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: "hello",
            },
        },
        {
            testName: "non-atomic invalid argument type",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: false,
                body: 123,
            },
        },
        {
            testName: "atomic invalid argument type",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["echo.string", 123],
                ],
            },
        },
        {
            testName: "pluck of wrong type",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["echo.string", "hello", ["result", ["attr"]]],
                ],
            },
        },
        {
            testName: "pluck of null",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["echo.null", null, ["result", ["attr"]]],
                ],
            },
        },
        {
            testName: "pluck of invalid sub-attribute",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [["object", null, ["result", ["oneDeep", "x"]]]],
            },
        },
        {
            testName: "pluck of array constructor attribute",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [["object", null, ["result", ["oneDeep", "array", "pluck"]]]],
            },
        },
        {
            testName: "pluck of constructor attribute",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    // If this is a 200, it is VERY bad. We should not be able to pluck the constructor attribute.
                    ["object", null, ["result", ["oneDeep", "constructor"]]],
                ],
            },
        },

        // Success cases

        {
            testName: "useRequest in atomic request",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {
                    "X-Is-Skibidi": "much rizz",
                },
                get: true,
                body: [
                    ["request", null],
                ],
            },
        },
        {
            testName: "useRequest in non-atomic request",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=request",
                headers: {
                    "X-Is-Skibidi": "much rizz",
                },
                get: true,
                body: null,
            },
        },
        {
            testName: "echoes string in non-atomic get request",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: true,
                body: "hello",
            },
        },
        {
            testName: "echoes string in non-atomic post request",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.string",
                headers: {},
                get: false,
                body: "hello",
            },
        },
        {
            testName: "echoes string from a atomic variable",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: true,
                body: [
                    [["arg", "hello"]],
                    [["arg"], "echo.string"],
                ],
            },
        },
        {
            testName: "echoes null",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo.null",
                headers: {},
                get: true,
                body: null,
            },
        },
        {
            testName: "many null in atomic request",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: true,
                body: [
                    [["arg", null]],
                    [["arg"], "echo.null"],
                ],
            },
        },
        {
            testName: "non-atomic commits",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=commit",
                headers: {},
                get: false,
                body: null,
                before: () => {
                    global.commitCount = 0;
                },
                after: () => {
                    const count = global.commitCount;
                    delete global.commitCount;
                    if (count !== 1) {
                        throw new Error("commitCount was not 1");
                    }
                },
            },
        },
        {
            testName: "atomic commits",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["commit", null],
                ],
                before: () => {
                    global.commitCount = 0;
                },
                after: () => {
                    const count = global.commitCount;
                    delete global.commitCount;
                    if (count !== 1) {
                        throw new Error("commitCount was not 1");
                    }
                },
            },
        },
        {
            testName: "assign result to variable",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["echo.string", "hello", "result"],
                    [["result"], "echo.string"],
                ],
            },
        },
        {
            testName: "successful pluck to variable",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["object", null, ["result", ["oneDeep", "string"]]],
                    [["result"], "echo.string"],
                ],
            },
        },
        {
            testName: "successful pluck to output",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["object", null, [null, ["oneDeep", "string"]]],
                ],
            },
        },
    ],
);

function mathOpTest(op: string, trueOp: number, falseOp: number) {
    const handler = basicUnauthedRpc.buildHttpHandler();
    return runGoldenTests(
        __dirname, __filename, [
            {
                testName: `${op} returns true`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["number", null, "result"],
                        [["result", "result", trueOp, op], "echo.number"],
                    ],
                },
            },
            {
                testName: `${op} returns false`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["number", null, "result"],
                        [["result", "result", falseOp, op], "echo.number"],
                    ],
                },
            },
            {
                testName: `${op} with constant as passthrough`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["number", null, "result"],
                        [[[69], "result", trueOp, op], "echo.number"],
                    ],
                },
            },
            {
                testName: `${op} with true pluck`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["object", null, "result"],
                        [[[69], "result", trueOp, op, ["oneDeep", "number"]], "echo.number"],
                    ],
                },
            },
            {
                testName: `${op} with false pluck`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["object", null, "result"],
                        [[[69], "result", falseOp, op, ["oneDeep", "number"]], "echo.number"],
                    ],
                },
            },
            {
                testName: `${op} with constructor pluck`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["object", null, "result"],
                        [[[69], "result", trueOp, op, ["oneDeep", "constructor"]], "echo.number"],
                    ],
                },
            },
            {
                testName: `${op} with invalid pluck during iteration`,
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["object", null, "result"],
                        [[[69], "result", trueOp, op, ["oneDeep", "attr", "a"]], "echo.number"],
                    ],
                },
            },
        ], async (input) => {
            const req = new Request(input.url, {
                method: input.get ? "GET" : "POST",
                headers: input.headers,
                body: encode(input.body),
            });
            const res = await handler(req);
            return rpcResponseToString(res);
        }, true, test,
    );
}

mathOpTest(">", 1, 3);
mathOpTest(">=", 1, 3);
mathOpTest("=", 2, 3);
mathOpTest("!", 3, 2);

class CustomError extends Error {
    body: any;

    constructor(message: string) {
        super(message);
    }
}

describe("custom exceptions", () => {
    const router = new RPCRouter().setRoutes({
        v1: {
            custom: {
                input: Null(),
                output: Null(),
                method: async () => {
                    throw new CustomError("This is a test error");
                },
            },
            customWithError: {
                input: Null(),
                output: Null(),
                method: async () => {
                    const e = new CustomError("This is a test error");
                    e.body = "This is a test error body";
                    throw e;
                },
            },
            standard: {
                input: Null(),
                output: Null(),
                method: async () => {
                    throw new Error("This is a test error");
                },
            },
        },
    }).setExceptions({ CustomError });

    rpcRouterGolden(router, [
        {
            testName: "non-atomic standard error still internal with custom exception",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=standard",
                headers: {},
                get: false,
                body: null,
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "atomic standard error still internal with custom exception",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["standard", null],
                ],
                before: () => {
                    global.setTimeout1 = global.setTimeout;
                    global.timeoutCount = 0;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = (cb: () => void, ms: number) => {
                        if (ms !== 0) {
                            throw new Error("setTimeout was called with a non-zero delay");
                        }
                        let err: Error | undefined;
                        try {
                            cb();
                        } catch (err2) {
                            err = err2 as Error;
                        }
                        if (!err) {
                            throw new Error("setTimeout did not throw an error");
                        }
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                },
            },
        },
        {
            testName: "non-atomic custom error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=custom",
                headers: {},
                get: false,
                body: null,
            },
        },
        {
            testName: "atomic custom error",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["custom", null],
                ],
            },
        },
        {
            testName: "non-atomic custom error with body",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=customWithError",
                headers: {},
                get: false,
                body: null,
            },
        },
        {
            testName: "atomic custom error with body",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["customWithError", null],
                ],
            },
        },
    ], true);
});

let value = "";

let rlThrows = false;
let ratelimited = false;
let rlCalls = 0;

async function rlMiddleware(methodName: string, arg: any) {
    if (value !== arg) {
        throw new Error("arg mismatch");
    }
    if (methodName !== "ratelimiting.turnOn" && methodName !== "ratelimiting.test") {
        throw new Error("method name mismatch");
    }
    rlCalls++;
    if (rlThrows) {
        throw new Error("rlThrows");
    }
    if (ratelimited) {
        throw new Ratelimited("You are ratelimited", {
            nickelback: true,
        });
    }
}

const rlRoutes = {
    v1: {
        ratelimiting: {
            turnOn: {
                input: Null(),
                output: Null(),
                method: async () => {
                    ratelimited = true;
                    return null;
                },
            },
            test: {
                input: string(),
                output: Null(),
                method: async () => {
                    return null;
                },
            },
        },
    },
} as const;

const rlRouter = new RPCRouter()
    .setRoutes(rlRoutes)
    .setRateLimiting(rlMiddleware);

describe("ratelimiting", () => {
    rpcRouterGolden(rlRouter, [
        // Error cases

        {
            testName: "non-atomic get ratelimited",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=ratelimiting.test",
                headers: {},
                get: false,
                before: () => {
                    ratelimited = true;
                },
                body: "",
                after: () => {
                    if (rlCalls !== 1) {
                        throw new Error("rlCalls was not 1");
                    }
                },
            },
        },
        {
            testName: "non-atomic post ratelimited",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=ratelimiting.test",
                headers: {},
                get: false,
                before: () => {
                    rlCalls = 0;
                    ratelimited = true;
                },
                body: "",
                after: () => {
                    if (rlCalls !== 1) {
                        throw new Error("rlCalls was not 1");
                    }
                },
            },
        },
        {
            testName: "atomic ratelimited",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["ratelimiting.turnOn", ""],
                    ["ratelimiting.test", ""],
                ],
            },
        },
        {
            testName: "non-atomic ratelimiter throws",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=ratelimiting.test",
                headers: {},
                get: false,
                body: "",
                before: () => {
                    rlThrows = true;
                    global.timeoutCount = 0;
                    global.setTimeout1 = global.setTimeout;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = () => {
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    rlThrows = false;
                },
            },
        },
        {
            testName: "atomic ratelimiter throws",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["ratelimiting.test", ""],
                ],
                before: () => {
                    rlThrows = true;
                    global.timeoutCount = 0;
                    global.setTimeout1 = global.setTimeout;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = () => {
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    rlThrows = false;
                },
            },
        },

        // Success cases

        {
            testName: "successful non-atomic get ratelimiting call",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=ratelimiting.test",
                headers: {},
                get: true,
                body: "",
            },
        },
        {
            testName: "successful non-atomic post ratelimiting call",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=ratelimiting.test",
                headers: {},
                get: false,
                before: () => {
                    rlCalls = 0;
                    value = "hello";
                },
                body: "hello",
                after: () => {
                    if (rlCalls !== 1) {
                        throw new Error("rlCalls was not 1");
                    }
                },
            },
        },
    ]);
});

enum TokenTypes {
    BEARER = "Bearer",
}

let authThrows = false;

const authedRouter = new RPCRouter().setAuthHandler({
    TokenTypes,
    defaultTokenType: TokenTypes.BEARER,
    validate: async (token: string) => {
        if (authThrows) {
            throw new Error("authThrows");
        }
        if (token !== "valid") {
            return null;
        }
        return { skibidi: "much rizz" } as const;
    },
}).setRoutes({
    v1: {
        echo: {
            input: string(),
            output: string(),
            method: async (arg: string, user: { skibidi: string }) => {
                if (user.skibidi !== "much rizz") {
                    throw new Error("user mismatch");
                }
                return arg;
            },
        },
    },
});

describe("authentication", () => {
    rpcRouterGolden(authedRouter, [
        // Error cases

        {
            testName: "non-atomic empty authorization header",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo",
                headers: {},
                get: false,
                body: "hello",
            },
        },
        {
            testName: "atomic empty authorization header",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {},
                get: false,
                body: [
                    ["echo", "hello"],
                ],
            },
        },
        {
            testName: "invalid token type",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo",
                headers: {
                    "Authorization": "Abc invalid",
                },
                get: false,
                body: "hello",
            },
        },
        {
            testName: "blank token",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo",
                headers: {
                    "Authorization": "Abc",
                },
                get: false,
                body: "hello",
            },
        },
        {
            testName: "auth throws",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo",
                headers: {
                    "Authorization": "Bearer valid",
                },
                get: false,
                body: "hello",
                before: () => {
                    authThrows = true;
                    global.timeoutCount = 0;
                    global.setTimeout1 = global.setTimeout;
                    // @ts-expect-error: This is fine.
                    global.setTimeout = () => {
                        global.timeoutCount++;
                    };
                },
                after: () => {
                    const count = global.timeoutCount;
                    delete global.timeoutCount;
                    if (count !== 1) {
                        throw new Error("setTimeout was called the wrong number of times");
                    }
                    global.setTimeout = global.setTimeout1;
                    delete global.setTimeout1;
                    authThrows = false;
                },
            },
        },
        {
            testName: "non-atomic invalid token",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo",
                headers: {
                    "Authorization": "Bearer invalid",
                },
                get: false,
                body: "hello",
            },
        },
        {
            testName: "atomic invalid token",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {
                    "Authorization": "Bearer invalid",
                },
                get: false,
                body: [
                    ["echo", "hello"],
                ],
            },
        },

        // Success cases

        {
            testName: "successful non-atomic authenticated route",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=echo",
                headers: {
                    "Authorization": "Bearer valid",
                },
                get: false,
                body: "hello",
            },
        },
        {
            testName: "successful atomic authenticated route",
            input: {
                url: "https://example.com/api/rpc?version=v1&route=atomic",
                headers: {
                    "Authorization": "Bearer valid",
                },
                get: false,
                body: [
                    ["echo", "hello"],
                ],
            },
        },
    ], true);

    describe("with ratelimiter", () => {
        let userSet = false;

        const ratelimiter = authedRouter.setRateLimiting(async (methodName, arg, user) => {
            if (methodName !== "echo") {
                throw new Error("method name mismatch");
            }
            if (arg !== "hello") {
                throw new Error("arg mismatch");
            }
            if (userSet) {
                if (!user || user.skibidi !== "much rizz") {
                    throw new Error("user mismatch");
                }
            } else if (user) {
                throw new Error("user set unexpectedly");
            }
        });

        rpcRouterGolden(ratelimiter, [
            {
                testName: "non-atomic non-authenticated with rate limiting",
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=echo",
                    headers: {},
                    get: false,
                    body: "hello",
                },
            },
            {
                testName: "non-atomic authenticated with rate limiting",
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=echo",
                    headers: {
                        "Authorization": "Bearer valid",
                    },
                    get: false,
                    body: "hello",
                    before: () => {
                        userSet = true;
                    },
                },
            },
            {
                testName: "atomic authenticated with rate limiting",
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {
                        "Authorization": "Bearer valid",
                    },
                    get: false,
                    body: [
                        ["echo", "hello"],
                    ],
                },
            },
            {
                testName: "atomic un-authenticated with rate limiting",
                input: {
                    url: "https://example.com/api/rpc?version=v1&route=atomic",
                    headers: {},
                    get: false,
                    body: [
                        ["echo", "hello"],
                    ],
                    before: () => {
                        userSet = false;
                    },
                },
            },
        ]);
    });
});
