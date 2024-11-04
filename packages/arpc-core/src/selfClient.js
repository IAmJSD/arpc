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

                // Check if there's a schema and if there is wrap the method.
                if (route.input) {
                    return async (arg) => {
                        const res = await route.input.parseAsync(arg);
                        return await route.output.parseAsync(await m(res));
                    };
                }
                return m;
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
