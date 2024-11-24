import type {
    AuthenticatedRequestHandler, HandlerMapping, UnauthenticatedRequestHandler,
} from "./schema";

/** Handles finding the route. */
export function findRoute<
    Handler extends UnauthenticatedRequestHandler<any, any> | AuthenticatedRequestHandler<any, any, any>,
>(routeKey: string, routes: HandlerMapping<Handler>) {
    let route = routes;
    if (routeKey === "") {
        return null;
    }
    for (const key of routeKey.split(".")) {
        route = (route as any)[key];
        if (!route) {
            return null;
        }
    }
    if (typeof route.method !== "function") {
        return null;
    }
    return route as Handler;
}
