import { decode, encode } from "@msgpack/msgpack";
import { RPCRouter } from "./router";
import { GoldenItem, runGoldenTests } from "./tests/utils/golden";
import { UnauthenticatedRequestHandler } from "./schema";
import { null as Null, nullable, string } from "valibot";
import { useRequest } from "./helpers";

type GoldenInput = {
    url: string;
    headers: Record<string, string>;
    get: boolean;
    body: any;
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

function unauthedRpcRouterGolden(
    rpc: RPCRouter<UnauthenticatedRequestHandler<any, any>, any, any, any>,
    tests: GoldenItem<GoldenInput>[],
) {
    const handler = rpc.buildHttpHandler();
    return runGoldenTests(
        __dirname, __filename, tests,
        async (input) => {
            let bodyEnc: Uint8Array | undefined = [_invalidMsgpack, _invalidEncoding].includes(input.body) ?
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
                input.url += "&arg=" + e;
            }

            // Make the request.
            const req = new Request(input.url, {
                method: input.get ? "GET" : "POST",
                headers: input.headers,
                body: bodyEnc,
            });
            const res = await handler(req);
            return rpcResponseToString(res);
        }, true,
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
            null: {
                input: Null(),
                output: Null(),
                method: async () => null,
            },
        },
    },
});

unauthedRpcRouterGolden(
    basicUnauthedRpc,
    [
        // Error cases

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
    ],
);
