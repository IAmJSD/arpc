import { decode, encode } from "@msgpack/msgpack";
import { storagePromise, taintWithWorkerContext } from "./workerContext";
import { Ratelimited } from "./ratelimiting";

// Defines the magic key for request.
export const _requestMagicKey = Symbol("arpcRequest");

// Defines the magic key for transactions.
export const _txMagicKey = Symbol("arpcTx");

// Handles finding the route.
function findRoute(routeKey, routes) {
    let route = routes;
    if (routeKey === "") {
        return null;
    }
    for (const key of routeKey.split(".")) {
        route = route[key];
        if (!route) {
            return null;
        }
    }
    if (typeof route.method !== "function") {
        return null;
    }
    return route;
}

// Take a URL-encoded param string and quickly convert it to a Uint8Array.
function paramu8a(param) {
    // Create a buffer for the param to live in.
    const buffer = new Uint8Array(param.length);

    // Defines the actual length of the bit of the buffer we're using.
    let len = 0;

    // Iterate over the param string.
    for (let i = 0; i < param.length; i++) {
        const v = param.charCodeAt(i);
        if (v === 37) {
            // This is a percent sign.
            if (i + 2 >= param.length) {
                throw new Error("Invalid percent encoding");
            }
            buffer[len++] = parseInt(param.substring(i + 1, i + 3), 16);
            i += 2;
        } else {
            // This is a normal character.
            buffer[len++] = v;
        }
    }

    // Return the truncated buffer.
    return buffer.slice(0, len);
}

// Handles safely parsing the URL query when a binary arg is in it.
function safeParseQuery(url) {
    // Match the arguments.
    const questionMarkIndex = url.indexOf("?");
    if (questionMarkIndex === -1) {
        return new URLSearchParams();
    }
    const params = url.substring(questionMarkIndex + 1);

    // Split the arguments.
    const args = params.split("&");
    const m = new Map();
    for (const arg of args) {
        const equalsIndex = arg.indexOf("=");
        const before = arg.substring(0, equalsIndex);
        if (equalsIndex !== -1) {
            const after = arg.substring(equalsIndex + 1);
            m.set(before, before === "arg" ? paramu8a(after) : after);
        }
    }

    // Return the map.
    return m;
}

// Defines the function to build the request handler. Most of this is untyped due to the nature
// of iterating complex data structures, but the actual request handler is JSDoc typed.
export default (globalRoutes, auth, exceptions, ratelimiter) => {
    // Flat pack the supported token types into a map of lower case strings to the token type.
    const tokenTypeMap = new Map();
    if (auth) {
        for (const type of Object.values(auth.TokenTypes)) {
            tokenTypeMap.set(type.toLowerCase(), type);
        }
    }

    // Map custom exception constructors to their names.
    const exceptionMap = new Map();
    for (const [name, cls] of Object.entries(exceptions)) {
        exceptionMap.set(cls, name);
    }

    // Handle built in errors.
    const builtInError = (clsName, code, message, body, bulk) => {
        const b = {
            builtIn: true,
            name: clsName,
            code,
            message,
            body: body || null,
        };

        return bulk ? [
            b,
            clsName === "InternalServerError" ? 500 : 400,
        ] : new Response(
            encode(b),
            {
                status: clsName === "InternalServerError" ? 500 : 400,
                headers: {
                    "Content-Type": "application/msgpack",
                    "x-is-arpc": "true",
                },
            },
        );
    };

    // Handle custom exceptions.
    const handleExceptions = (err, bulk) => {
        // Check if the error is a custom exception.
        const name = exceptionMap.get(err.constructor);
        if (name) {
            // We can safely throw this to the user.
            const j = {
                builtIn: false,
                name,
                body: err.body || null,
            };
            return bulk ? [j, 400] : new Response(
                encode(j),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/msgpack",
                        "x-is-arpc": "true",
                    },
                },
            );
        }

        // Throw in another immediate context so that a handler in the global scope can catch it.
        setTimeout(() => {
            throw err;
        }, 0);

        // Return a generic error.
        return builtInError("InternalServerError", "INTERNAL_ERROR", "An internal error occurred", null, bulk);
    };

    /**
     * The internal handler for the request.
     * 
     * @param {Request} req: The request object.
     * @returns {Promise<Response>} The response object.
     */
    return async function handler(req) {
        // Handle the route.
        let q;
        try {
            q = req.method === "POST" ? new URL(req.url).searchParams : safeParseQuery(req.url);
        } catch {
            return builtInError("BadRequest", "INVALID_URL", "The URL specified is invalid");
        }
        const routeKey = q.get("route");
        if (!routeKey) {
            return builtInError("BadRequest", "MISSING_ROUTE", "Missing route parameter");
        }

        // Get the version.
        const version = q.get("version");
        if (!version) {
            return builtInError("BadRequest", "MISSING_VERSION", "Missing version parameter");
        }
        const routes = globalRoutes[version];
        if (!routes) {
            return builtInError("BadRequest", "VERSION_NOT_FOUND", "Version not found");
        }

        // Await the storage promise so that we don't race with the worker context.
        await storagePromise;

        // Return the tainted handler.
        const ctx = new Map([[_requestMagicKey, req]]);
        return taintWithWorkerContext(ctx, async () => {
            // Handle user authentication.
            let user = null;
            const authHeader = req.headers.get("Authorization");
            if (auth && authHeader) {
                // Split the header into the type and the token.
                const [type, token] = authHeader.split(" ");
                if (!token) {
                    return builtInError("BadRequest", "MISSING_TOKEN", "Missing token from Authorization header");
                }

                // Check if the token type is valid.
                const tokenType = tokenTypeMap.get(type.toLowerCase());
                if (!tokenType) return builtInError("Unauthorized", "BAD_TOKEN_TYPE", "Invalid token type");

                // Authenticate the user.
                try {
                    user = await auth.validate(token, tokenType);
                } catch (err) {
                    return handleExceptions(err);
                }
                if (user === null) {
                    return builtInError("Unauthorized", "INVALID_TOKEN", "Invalid token");
                }
            }

            // Get the argument.
            let arg;
            try {
                if (req.method === "POST") {
                    arg = decode(new Uint8Array(await req.arrayBuffer()));
                } else {
                    // Get the argument from the URL.
                    arg = q.get("arg");
                    if (!arg) {
                        return builtInError("BadRequest", "MISSING_ARG", "Missing arg parameter");
                    }
    
                    // Decode the argument.
                    arg = decode(arg);
                }
            } catch {
                return builtInError("BadRequest", "INVALID_ARG", "The argument specified failed to decode");
            }

            let resp;
            if (routeKey === "batch") {
                // Get all of the routes.
                const batchRoutes = [];
                if (!Array.isArray(arg)) {
                    return builtInError("BadRequest", "INVALID_ARG", "Argument must be an array");
                }
                for (const routeInfo of arg) {
                    // Make sure the routes are an object.
                    if (typeof routeInfo !== "object") {
                        return builtInError("BadRequest", "INVALID_ARG", "Argument must be an object");
                    }

                    // Get the route.
                    const route = findRoute(routeInfo.methodName, routes);
                    if (!route) {
                        return builtInError("BadRequest", "ROUTE_NOT_FOUND", "Route not found");
                    }
                    batchRoutes.push(route);
                }

                // Check authentication for all of the routes.
                if (!user && auth) {
                    const errors = [];
                    for (let routeIndex = 0; routeIndex < batchRoutes.length; routeIndex++) {
                        const route = batchRoutes[routeIndex];
                        if (route.authenticated || route.authenticated === undefined) {
                            errors.push(["Unauthorized", "UNAUTHENTICATED", `Route ${arg[routeIndex].methodName} requires authentication`]);
                        }
                    }
                    if (errors.length > 0) {
                        return builtInError(errors);
                    }
                }

                // Handles executing the chunks.
                const chunks = [];
                const responses = [];
                let allNull = true;
                const flush = async () => {
                    // Add a bunch of nulls that work as placeholders to responses.
                    const indexStart = responses.length;
                    responses.push(...Array(chunks.length).fill(null));

                    // Each worker either returns a error object or nothing.
                    const workers = chunks.map(([route, arg], i) => (async () => {
                        // Call the route schema.
                        try {
                            arg = await route.input.parseAsync(arg);
                        } catch (err) {
                            return builtInError("BadRequest", "INVALID_ARG", "The argument specified failed validation.", err.errors, true);
                        }

                        // Call the ratelimiter with the route, argument, and user.
                        if (ratelimiter) {
                            try {
                                await ratelimiter(route, arg, user);
                            } catch (err) {
                                if (err instanceof Ratelimited) {
                                    return builtInError("Ratelimited", err.code, err.message, err.body, true);
                                }
                                return handleExceptions(err, true);
                            }
                        }

                        // Call the route method.
                        try {
                            const resp = await route.method(arg, user);
                            if (resp !== null) {
                                allNull = false;
                            }
                            responses[indexStart + i] = await route.output.parseAsync(resp);
                            return null;
                        } catch (err) {
                            return handleExceptions(err, true);
                        }
                    })());

                    // Wait for all of the workers to finish.
                    const errors = (await Promise.all(workers)).filter((r) => r !== null);
                    if (errors.length > 0) {
                        // Rollback all of the transactions.
                        const [, rollbackFns] = ctx.get(_txMagicKey) || [null, []];
                        try {
                            for (const fn of rollbackFns) {
                                await fn();
                            }
                        } catch {
                            // If rolling back fails, ignore this. The initial error is more important.
                            // We do not commit, so this is fine.
                        }

                        // Get the highest status code.
                        let highestStatus = 0;
                        for (const err of errors) {
                            highestStatus = Math.max(highestStatus, err[1]);
                        }
                        return new Response(
                            encode(errors.length === 1 ? errors[0][0] : errors.map((r) => r[0])),
                            {
                                status: highestStatus,
                                headers: {
                                    "Content-Type": "application/msgpack",
                                    "x-is-arpc": "true",
                                },
                            },
                        );
                    }

                    // Clear the chunks.
                    chunks.length = 0;
                };

                // Handles chunking all of the requests.
                const args = arg.map((a) => a.arg);
                for (let routeIndex = 0; routeIndex < batchRoutes.length; routeIndex++) {
                    const arg = args[routeIndex];
                    const route = batchRoutes[routeIndex];
                    if (!route.parallel && chunks.length > 0) {
                        // We need to flush all previous requests before we do a mutation.
                        const res = await flush();
                        if (res) {
                            return res;
                        }
                    }
                    chunks.push([route, arg]);
                    if (!route.parallel) {
                        // Flush the chunk.
                        const res = await flush();
                        if (res) {
                            return res;
                        }
                    }
                }
                if (chunks.length > 0) {
                    const res = await flush();
                    if (res) {
                        return res;
                    }
                }

                // Set the response appropriately.
                resp = allNull ? null : responses;
            } else {
                // Get the route.
                const route = findRoute(routeKey, routes);
                if (!route) {
                    return builtInError("BadRequest", "ROUTE_NOT_FOUND", "Route not found");
                }
    
                // Call the ratelimiter with the route, argument, and user.
                if (ratelimiter) {
                    try {
                        await ratelimiter(route, arg, user);
                    } catch (err) {
                        if (err instanceof Ratelimited) {
                            return builtInError("Ratelimited", err.code, err.message, err.body);
                        }
                        return handleExceptions(err);
                    }
                }
    
                // Handle checking if the endpoint requires authentication and none was provided.
                if (auth && (route.authenticated || route.authenticated === undefined) && !user) {
                    return builtInError("Unauthorized", "UNAUTHENTICATED", "Route requires authentication");
                }
    
                // Call the route input schema.
                try {
                    arg = await route.input.parseAsync(arg);
                } catch (err) {
                    return builtInError("BadRequest", "INVALID_ARG", "The argument specified failed validation.", err.errors);
                }
    
                // Call the route method.
                try {
                    resp = await route.output.parseAsync(await route.method(arg, user));
                } catch (err) {
                    // Run all of the rollback functions.
                    const [, rollbackFns] = ctx.get(_txMagicKey) || [null, []];
                    try {
                        for (const fn of rollbackFns) {
                            await fn();
                        }
                    } catch {
                        // If rolling back fails, ignore this. The initial error is more important.
                        // We do not commit, so this is fine.
                    }

                    // Handle the exception that caused this in the first place.
                    return handleExceptions(err);
                }
            }

            // Run all of the commit functions.
            const [commitFns] = ctx.get(_txMagicKey) || [[]];
            try {
                for (const fn of commitFns) {
                    await fn();
                }
            } catch (err) {
                // Handle the exception that caused this.
                return handleExceptions(err);
            }

            // If the response is null, return a 204.
            if (resp === null) {
                return new Response(null, {
                    status: 204,
                    headers: {
                        "x-is-arpc": "true",
                    },
                });
            }

            // Encode the response.
            return new Response(encode(resp), {
                headers: {
                    "Content-Type": "application/msgpack",
                    "x-is-arpc": "true",
                },
            });
        });
    }
};
