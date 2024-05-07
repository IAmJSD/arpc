import { encode, decode } from "@msgpack/msgpack";
import { toBase64 } from "fast-base64";
import * as exceptions from "./exceptions";
import { BatchError } from "./BatchError";

function _writeExecutors(client, obj, routes, stack) {
    const execute = client._executeOne.bind(client);
    for (const [key, value] of Object.entries(routes)) {
        if (typeof value.mutation === "boolean") {
            const methodName = `${stack.join(".")}${stack.length === 0 ? "." : ""}${key}`;
            obj[key] = (arg) => execute(methodName, value.mutation, arg);
        } else {
            obj[key] = {};
            _writeExecutors(client, obj[key], value, [...stack, key]);
        }
    }
}

function _writeStubExecutors(client, obj, routes, stack) {
    for (const [key, value] of Object.entries(routes)) {
        if (typeof value.mutation === "boolean") {
            const methodName = `${stack.join(".")}${stack.length === 0 ? "." : ""}${key}`;
            obj[key] = (arg) => ({
                methodName, arg, mutation: value.mutation,
            });
        } else {
            obj[key] = {};
            _writeStubExecutors(client, obj[key], value, [...stack, key]);
        }
    }
}

export class BaseClient {
    constructor(schema, token, defaultTokenType) {
        this._schema = schema;
        this._token = token;
        this._tokenType = defaultTokenType || this._schema.defaultTokenType;
        if (!this._tokenType && this._token) {
            throw new Error("No token type provided.");
        }

        _writeExecutors(this, this, this._schema.routes, []);
        this._stubs = {};
        _writeStubExecutors(this, this._stubs, this._schema.routes, []);
    }

    _processException(body) {
        if (body.builtIn) {
            const exception = exceptions[body.name];
            if (exception) {
                // Throw the exception.
                throw new exception(body.code, body.message, body.body);
            } else {
                // Throw a generic exception.
                throw new exceptions.Exception(body.code, body.message, body.body);
            }
        }

        const exception = this._schema.exceptions[body.name];
        if (!exception) {
            throw new exceptions.Exception("UNKNOWN_EXCEPTION", `The exception ${body.name} is missing.`, body);
        }
        throw new exception(body.body);
    }

    async _executeOne(route, mutation, arg) {
        const params = [
            ["route", route], ["version", this._schema.version],
        ];
        if (!mutation && arg !== undefined) {
            params.push(["arg", toBase64(encode(arg))]);
        }
        const searchParams = new URLSearchParams(params);

        const url = this._schema.hostname ?
            `https://${this._schema.hostname}/api/rpc?${searchParams.toString()}` :
            `/api/rpc?${searchParams.toString()}`;

        const headers = new Headers();
        if (this._token) {
            headers.set("Authorization", `${this._tokenType} ${this._token}`);
        }
        let body;
        if (mutation && arg !== undefined) {
            headers.set("Content-Type", "application/msgpack");
            body = encode(arg);
        }

        const res = await fetch(url, {
            method: mutation ? "POST" : "GET",
            headers, body,
        });
        if (res.headers.get("X-Is-Arpc") !== "true") {
            throw new exceptions.InvalidResponse("INVALID_RESPONSE", "The response is not an arpc response.");
        }

        body = new Uint8Array(await res.arrayBuffer());
        if (!res.ok) {
            // Handle the exception.
            try {
                body = decode(body);
            } catch {
                throw new exceptions.InvalidResponse("INVALID_RESPONSE", "The response is not a valid msgpack response.");
            }
            this._processException(body);
        }

        if (res.status === 204) return null;
        try {
            return decode(body);
        } catch {
            throw new exceptions.InvalidResponse("INVALID_RESPONSE", "The response is not a valid msgpack response.");
        }
    }

    async batch(fn) {
        const requests = await fn(this._stubs);

        let containsMutation = false;
        for (const request of requests) {
            if (request.mutation) {
                containsMutation = true;
                break;
            }
        }

        const params = [
            ["route", "batch"], ["version", this._schema.version],
        ];
        const arr = requests.map(({ methodName, arg }) => ({
            methodName, arg: arg !== undefined ? arg : null,
        }));
        if (!containsMutation) {
            // Embed in the URL.
            params.push(["arg", toBase64(encode(arr))]);
        }
        const searchParams = new URLSearchParams(params);

        const url = this._schema.hostname ?
            `https://${this._schema.hostname}/api/rpc?${searchParams.toString()}` :
            `/api/rpc?${searchParams.toString()}`;

        const headers = new Headers();
        if (this._token) {
            headers.set("Authorization", `${this._tokenType} ${this._token}`);
        }
        let body;
        if (containsMutation) {
            headers.set("Content-Type", "application/msgpack");
            body = encode(arr);
        }

        const res = await fetch(url, {
            method: mutation ? "POST" : "GET",
            headers, body,
        });
        if (res.headers.get("X-Is-Arpc") !== "true") {
            throw new exceptions.InvalidResponse("INVALID_RESPONSE", "The response is not an arpc response.");
        }

        body = new Uint8Array(await res.arrayBuffer());
        if (!res.ok) {
            // Decode the body.
            try {
                body = decode(body);
            } catch {
                throw new exceptions.InvalidResponse("INVALID_RESPONSE", "The response is not a valid msgpack response.");
            }

            // Check if it is an array.
            if (Array.isArray(body)) {
                throw new BatchError(body.map((b) => {
                    try {
                        this._processException(b);
                    } catch (e) {
                        return e;
                    }
                }));
            }

            // Handle the exception.
            this._processException(body);
        }

        // Decode the body.
        try {
            return decode(body);
        } catch {
            throw new exceptions.InvalidResponse("INVALID_RESPONSE", "The response is not a valid msgpack response.");
        }
    }
}
