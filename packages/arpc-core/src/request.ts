import { decode, encode } from "@msgpack/msgpack";
import { storagePromise, taintWithWorkerContext } from "./workerContext";
import { Ratelimited, RateLimitingMiddleware } from "./ratelimiting";
import type {
    AuthenticatedRequestHandler, AuthHandler, HandlerMapping, UnauthenticatedRequestHandler,
} from "./schema";
import { Assignment, validateAtomicItems } from "./atomic";
import { findRoute } from "./requestUtils";
import { parseAsync } from "valibot";

// Defines the magic key for request.
export const _requestMagicKey = Symbol("arpcRequest");

// Defines the magic key for transactions.
export const _txMagicKey = Symbol("arpcTx");

// Take a URL-encoded param string and quickly convert it to a Uint8Array.
function paramu8a(param: string) {
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
function safeParseQuery(url: string) {
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

type BodyErrorConstructor = new (body: any) => Error;

/** Defines the function to build the request handler. */
export default function<
    Handler extends UnauthenticatedRequestHandler<any, any> | AuthenticatedRequestHandler<any, any, any>,
    Exceptions extends {[name: string]: BodyErrorConstructor} = {},
>(
    globalRoutes: HandlerMapping<Handler>, auth: AuthHandler<any, any> | null,
    exceptions: Exceptions,
    ratelimiter: RateLimitingMiddleware<any, any> | null,
) {
    // Flat pack the supported token types into a map of lower case strings to the token type.
    const tokenTypeMap = new Map();
    if (auth) {
        for (const type of Object.values(auth.TokenTypes)) {
            tokenTypeMap.set((type as string).toLowerCase(), type);
        }
    }

    // Map custom exception constructors to their names.
    const exceptionMap = new Map<BodyErrorConstructor, string>();
    for (const [name, cls] of Object.entries(exceptions)) {
        exceptionMap.set(cls, name);
    }

    // Handles a bulk built in error.
    const bulkBuiltInError = (clsName: string, code: string, message: string, body: any): [any, number] => [
        {
            builtIn: true,
            name: clsName,
            code,
            message,
            body: body || null,
        } as const,
        clsName === "InternalServerError" ? 500 : 400,
    ] as const;

    // Handles a built in error.
    const builtInError = (clsName: string, code: string, message: string, body: any) => {
        const b = {
            builtIn: true,
            name: clsName,
            code,
            message,
            body: body || null,
        };
        return new Response(
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

    // Handles a custom error.
    const handleBulkExceptions = (err: Error): [any, number] => {
        const name = exceptionMap.get(err.constructor as BodyErrorConstructor);
        if (name) {
            const j = {
                builtIn: false, name,
                body: (err as any).body || null,
            };
            return [j, 400] as const;
        }
        setTimeout(() => {
            throw err;
        }, 0);
        return bulkBuiltInError("InternalServerError", "INTERNAL_ERROR", "An internal error occurred", null);
    };
    const handleNonBulkExceptions = (err: Error) => {
        const name = exceptionMap.get(err.constructor as BodyErrorConstructor);
        if (name) {
            const j = {
                builtIn: false, name,
                body: (err as any).body || null,
            };
            return new Response(encode(j), {
                status: 400,
                headers: {
                    "Content-Type": "application/msgpack",
                    "x-is-arpc": "true",
                },
            });
        }
        setTimeout(() => {
            throw err;
        }, 0);
        return builtInError("InternalServerError", "INTERNAL_ERROR", "An internal error occurred", null);
    };

    // The internal handler for the request.
    return async function handler(req: Request): Promise<Response> {
        // Handle the route.
        interface Getter {
            get(name: string): string | Uint8Array | null;
        }
        let q: Getter;
        try {
            q = req.method === "POST" ? new URL(req.url).searchParams : safeParseQuery(req.url);
        } catch {
            return builtInError("BadRequest", "INVALID_URL", "The URL specified is invalid", null);
        }
        const routeKey = q.get("route");
        if (!routeKey) {
            return builtInError("BadRequest", "MISSING_ROUTE", "Missing route parameter", null);
        }

        // Get the version.
        const version = q.get("version");
        if (!version) {
            return builtInError("BadRequest", "MISSING_VERSION", "Missing version parameter", null);
        }
        const routes = globalRoutes[version as keyof typeof globalRoutes];
        if (!routes) {
            return builtInError("BadRequest", "VERSION_NOT_FOUND", "Version not found", null);
        }

        // Await the storage promise so that we don't race with the worker context.
        await storagePromise;

        // Return the tainted handler.
        const ctx = new Map<any, any>([[_requestMagicKey, req]]);
        return taintWithWorkerContext(ctx, async () => {
            // Handle user authentication.
            let user = null;
            const authHeader = req.headers.get("Authorization");
            if (auth && authHeader) {
                // Split the header into the type and the token.
                const [type, token] = authHeader.split(" ");
                if (!token) {
                    return builtInError("Unauthorized", "MISSING_TOKEN", "Missing token from Authorization header", null);
                }

                // Check if the token type is valid.
                const tokenType = tokenTypeMap.get(type.toLowerCase());
                if (!tokenType) return builtInError("Unauthorized", "BAD_TOKEN_TYPE", "Invalid token type", null);

                // Authenticate the user.
                try {
                    user = await auth.validate(token, tokenType);
                } catch (err) {
                    return handleNonBulkExceptions(err as Error);
                }
                if (user === null) {
                    return builtInError("Unauthorized", "INVALID_TOKEN", "Invalid token", null);
                }
            }

            // Get the argument.
            let arg: any;
            try {
                if (req.method === "POST") {
                    arg = decode(new Uint8Array(await req.arrayBuffer()));
                } else {
                    // Get the argument from the URL.
                    arg = q.get("arg");
                    if (!arg) {
                        return builtInError("BadRequest", "MISSING_ARG", "Missing arg parameter", null);
                    }

                    // Decode the argument.
                    arg = decode(arg);
                }
            } catch {
                return builtInError("BadRequest", "INVALID_ARG", "The argument specified failed to decode", null);
            }

            // Handle getting the wanted response.
            let resp: any;
            if (routeKey === "atomic") {
                // Invoke the atomic parser.
                const atomicResp = validateAtomicItems(arg, routes);
                if (!atomicResp.success) {
                    return builtInError("BadRequest", atomicResp.code, atomicResp.message, null);
                }
                const { handlers, items } = atomicResp;

                // Process each of the items in the atomic request.
                const variables = new Map<string, any>();
                let allNulls = true;
                const results: any[] = [];
                type QueueItem = [string, Handler, any, Assignment | undefined];
                const queue: QueueItem[] = [];
                const processOne = async (q: QueueItem, errors: [any, number][]) => {
                    const [route, handler, arg, assignment] = q;

                    // Call the ratelimiter with the route, argument, and user.
                    if (ratelimiter) {
                        try {
                            await ratelimiter(route, arg, user);
                        } catch (err) {
                            if (err instanceof Ratelimited) {
                                errors.push(
                                    bulkBuiltInError("Ratelimited", err.code, err.message, err.body)
                                );
                            } else {
                                errors.push(handleBulkExceptions(err as Error));
                            }
                            return;
                        }
                    }
                    
                    // Handle checking if the endpoint requires authentication and none was provided. Wrap route in any because authenticated
                    // not being there will go down the happy path.
                    if (auth && ((route as any).authenticated || (route as any).authenticated === undefined) && !user) {
                        errors.push(
                            bulkBuiltInError("Unauthorized", "UNAUTHENTICATED", "Route requires authentication", null),
                        );
                        return;
                    }

                    // Call the route input schema.
                    let parsedArg: any;
                    try {
                        parsedArg = await parseAsync(handler.input, arg);
                    } catch (err) {
                        errors.push(
                            bulkBuiltInError(
                                "BadRequest", "INVALID_ARG", "The argument specified failed validation.",
                                (err as any).errors,
                            ),
                        );
                        return;
                    }

                    // Call the route method.
                    let res: any;
                    try {
                        res = await handler.method(parsedArg, user);
                        results.push(res);
                    } catch (err) {
                        errors.push(handleBulkExceptions(err as Error));
                    }
                    if (res !== null) allNulls = false;
                    if (assignment) {
                        // Handle the 2 types of assignments.
                        if (typeof assignment === "string") {
                            // Assign to a variable specified by a string.
                            variables.set(assignment, res);
                        } else {
                            // Do some plucking.
                            const [variable, pluck] = assignment;
                            let val = res;
                            for (const attr of pluck) {
                                if (attr === "constructor") {
                                    errors.push(
                                        bulkBuiltInError("BadRequest", "INVALID_PLUCK", "Cannot pluck the constructor attribute", null),
                                    );
                                    return;
                                }
                                if (typeof val !== "object" || val === null || Array.isArray(val)) {
                                    errors.push(
                                        bulkBuiltInError("BadRequest", "INVALID_VARIABLE", `Variable ${variable} is not an object`, null),
                                    );
                                    return;
                                }
                                val = val[attr];
                            }
                            if (val === undefined) {
                                errors.push(
                                    bulkBuiltInError("BadRequest", "INVALID_VARIABLE", `Variable ${variable} is not a valid attribute`, null),
                                );
                                return;
                            }
                            variables.set(variable, val);
                        }
                    }
                };
                const flush = async (): Promise<Response | null> => {
                    if (queue.length === 0) {
                        // Fast path!
                        return null;
                    }
                    const errors: [any, number][] = [];
                    await Promise.all(queue.map(q => processOne(q, errors)));
                    if (errors.length > 0) {
                        const biggestStatus = errors.reduce((acc, curr) => Math.max(acc, curr[1]), 0);
                        
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

                        return new Response(encode(errors.map(([err]) => err)), {
                            status: biggestStatus,
                            headers: {
                                "Content-Type": "application/msgpack",
                                "x-is-arpc": "true",
                            },
                        });
                    }
                    queue.length = 0;
                    return null;
                };

                // Go through the items in the atomic request.
                for (const item of items) {
                    if (item.length === 1) {
                        // Atomic set operation.

                        // Flush first to not poison the variable.
                        const resp = await flush();
                        if (resp) return resp;

                        // Set the variable.
                        const [[variable, arg]] = item;
                        variables.set(variable, arg);
                        if (arg !== null) allNulls = false;
                        results.push(arg);
                    } else {
                        // Some sort of operation that requires execution.

                        if (typeof item[0] === "string") {
                            // Atomic constant operation.

                            const hn = handlers.get(item[0])! as Handler;
                            if (!hn.parallel) {
                                // Flush here since this does not want to be parallel.
                                const resp = await flush();
                                if (resp) return resp;
                            }

                            queue.push([item[0], hn, item[1], item[2]]);
                            if (item[2] || !hn.parallel) {
                                // Flush here since we're setting a variable or this is not parallel.
                                const resp = await flush();
                                if (resp) return resp;
                            }
                        } else {
                            // Atomic variable operation.

                            const hn = handlers.get(item[1])! as Handler;
                            if (!hn.parallel) {
                                // Flush here since this does not want to be parallel.
                                const resp = await flush();
                                if (resp) return resp;
                            }

                            const nonSet = item[0];
                            if (nonSet.length === 1) {
                                // Operation with a variable.

                                const [variable] = nonSet;
                                const val = variables.get(variable)!;
                                queue.push([item[1], hn, val, item[2]]);
                            } else {
                                // Atomic maths operation.
                                const [useVarOrConst, variable, constant, op, pluck] = nonSet;

                                // Process the variable.
                                let varToCompare = variables.get(variable);
                                if (varToCompare === undefined) {
                                    return builtInError("BadRequest", "MISSING_VARIABLE", `Missing variable ${variable}`, null);
                                }
                                for (const attr of pluck || []) {
                                    if (typeof varToCompare !== "object" || varToCompare === null) {
                                        return builtInError("BadRequest", "INVALID_VARIABLE", `Variable ${variable} is not an object`, null);
                                    }
                                    varToCompare = varToCompare[attr];
                                }
                                let opRes = false;
                                switch (op) {
                                    case ">":
                                        opRes = varToCompare > constant;
                                        break;
                                    case ">=":
                                        opRes = varToCompare >= constant;
                                        break;
                                    case "!":
                                        // The non-strict equality operator is intentional.
                                        opRes = varToCompare != constant;
                                        break;
                                    case "=":
                                        // The non-strict equality operator is intentional.
                                        opRes = varToCompare == constant;
                                        break;
                                }

                                if (opRes) {
                                    // Handle processing the variable if this is true.
                                    let resolvedVal: any;
                                    if (typeof useVarOrConst === "string") {
                                        const val = variables.get(useVarOrConst);
                                        if (val === undefined) {
                                            return builtInError("BadRequest", "MISSING_VARIABLE", `Missing variable ${useVarOrConst}`, null);
                                        }
                                        resolvedVal = val;
                                    } else {
                                        resolvedVal = useVarOrConst[0];
                                    }
                                    queue.push([item[1], hn, resolvedVal, item[2]]);
                                } else {
                                    // Flush and then push null to the results. Continue the loop.
                                    const resp = await flush();
                                    if (resp) return resp;
                                    results.push(null);
                                    continue;
                                }
                            }

                            if (item[2] || !hn.parallel) {
                                // Flush here since we're setting a variable or this is not parallel.
                                const resp = await flush();
                                if (resp) return resp;
                            }
                        }
                    }
                }

                // Flush the last time.
                const r = await flush();
                if (r) return r;

                // Set the response as expected.
                if (allNulls) {
                    resp = null;
                } else {
                    resp = results;
                }
            } else {
                // Get the handler.
                const route = findRoute(String(routeKey), routes);
                if (!route) {
                    return builtInError("BadRequest", "ROUTE_NOT_FOUND", "Route not found", null);
                }

                // Call the ratelimiter with the route, argument, and user.
                if (ratelimiter) {
                    try {
                        await ratelimiter(routeKey as string, arg, user);
                    } catch (err) {
                        if (err instanceof Ratelimited) {
                            return builtInError("Ratelimited", err.code, err.message, err.body);
                        }
                        return handleNonBulkExceptions(err as Error);
                    }
                }

                // Handle checking if the endpoint requires authentication and none was provided. Wrap route in any because authenticated
                // not being there will go down the happy path.
                if (auth && ((route as any).authenticated || (route as any).authenticated === undefined) && !user) {
                    return builtInError("Unauthorized", "UNAUTHENTICATED", "Route requires authentication", null);
                }

                // Call the route input schema.
                try {
                    arg = await parseAsync(route.input, arg);
                } catch (err) {
                    return builtInError("BadRequest", "INVALID_ARG", "The argument specified failed validation.", (err as any).errors);
                }

                // Call the route method.
                try {
                    resp = await parseAsync(route.output, await route.method(arg, user));
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
                    return handleNonBulkExceptions(err as Error);
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
                return handleNonBulkExceptions(err as Error);
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
}
