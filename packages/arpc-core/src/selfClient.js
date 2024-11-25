import { parseAsync } from "valibot";

const _magicObj = {};

class ProxyCursor {
    constructor(routes) {
        this._routes = routes;
    }
}

function buildProxy(user, routes) {
    return new Proxy(new ProxyCursor(routes), {
        get(cursor, key) {
            const route = cursor._routes[key];
            if (typeof route.method === "function") {
                // Get the method.
                let m;
                if (user === _magicObj) {
                    // Pass through just the function.
                    m = Reflect.get(route, "method");
                } else {
                    // Pass through the user.
                    m = (...args) => route.method(...args, user);
                }

                // Wrap the method.
                return async (arg) => {
                    const res = await parseAsync(route.input, arg);
                    return await parseAsync(route.output, await m(res));
                };
            }
            return buildProxy(user, route);
        },

        set() {
            throw new Error("Cannot set on the proxy object.");
        },
    });
}

export default function (routes, authSet) {
    if (authSet) {
        return u => buildProxy(u, routes);
    }
    return () => buildProxy(_magicObj, routes);
}
