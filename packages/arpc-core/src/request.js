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

// Defines the function to handle the request.
export default (routes, auth, exceptions, ratelimiter) => {
    // Flat pack the supported token types into a map of lower case strings to the
    // token type.
    const tokenTypeMap = new Map();
    if (auth) {
        for (const type of Object.values(auth.tokenTypes)) {
            tokenTypeMap.set(type.toLowerCase(), type);
        }
    }

    // Handle custom exceptions.
    const handleExceptions = (err, bulk) => {
        const className = err.constructor.name;
        if (className in exceptions) {
            // Return this as a response.
            // TODO
        }
        throw e;
    };

    /**
     * The internal handler for the request.
     * 
     * @param {Request} req: The request object.
     * @returns {Promise<Response>} The response object.
     */
    return async function handler(req) {
        // Handle the route.
        const url = new URL(req.url);
        const routeKey = url.searchParams.get("route");
        if (!routeKey) {
            return builtInError("BadRequest", "MISSING_ROUTE", "Missing route parameter");
        }

        // Get the version.
        const version = url.searchParams.get("version");
        if (!version) {
            return builtInError("BadRequest", "MISSING_VERSION", "Missing version parameter");
        }
        routes = routes[version];
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
            if (req.method === "POST") {
                arg = decode(new Uint8Array(await req.arrayBuffer()));
            } else {
                // Get the argument from the URL.
                arg = url.searchParams.get("arg");
                if (!arg) {
                    return builtInError("BadRequest", "MISSING_ARG", "Missing arg parameter");
                }

                // TODO: Parse the argument.
            }

            let resp;
            if (routeKey === "batch") {
                // Get all of the routes.
                const routes = [];
                if (!Array.isArray(arg)) {
                    return builtInError("BadRequest", "INVALID_ARG", "Argument must be an array");
                }
                for (const routes of arg) {
                    // Make sure the routes are an object.
                    if (typeof routes !== "object") {
                        return builtInError("BadRequest", "INVALID_ARG", "Argument must be an object");
                    }

                    // Get the route.
                    const route = findRoute(routeKey, routes.methodName);
                    if (!route) {
                        return builtInError("BadRequest", "ROUTE_NOT_FOUND", "Route not found");
                    }
                    routes.push(route);
                }

                // Check authentication for all of the routes.
                if (!user && auth) {
                    const errors = [];
                    for (const routeIndex in routes) {
                        const route = routes[routeIndex];
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
                            arg = await route.schema.parseAsync(arg);
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
                            responses[indexStart + i] = resp;
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
                                    "X-Is-Arpc": "true",
                                },
                            },
                        );
                    }
                };

                // Handles chunking all of the requests.
                const args = arg.map((a) => a.arg);
                for (const routeIndex in routes) {
                    const arg = args[routeIndex];
                    const route = routes[routeIndex];
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
    
                // Call the route schema.
                try {
                    arg = await route.schema.parseAsync(arg);
                } catch (err) {
                    return builtInError("BadRequest", "INVALID_ARG", "The argument specified failed validation.", err.errors);
                }
    
                // Call the route method.
                try {
                    resp = await route.method(arg, user);
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
                        "X-Is-Arpc": "true",
                    },
                });
            }

            // Encode the response.
            return new Response(encode(resp), {
                headers: {
                    "Content-Type": "application/msgpack",
                    "X-Is-Arpc": "true",
                },
            });
        });
    }
};
