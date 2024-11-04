import { AuthenticatedRequestHandler, HandlerMapping, UnauthenticatedRequestHandler } from "./schema";

type AuthenticationUserNullRoutes<
    User,
    Routes extends { [key: string]: HandlerMapping<AuthenticatedRequestHandler<User, any, any>> },
> = {
    [K in keyof Routes]: Routes[K] extends AuthenticatedRequestHandler<User, any, any> ?
        Routes[K]["authenticated"] extends false ?
            (input: Parameters<Routes[K]["method"]>[0]) => ReturnType<Routes[K]["method"]> :
            never
        :
        // @ts-expect-error: If this is hit, we cannot satisfy the handler type.
        AuthenticationUserNullRoutes<User, Routes[K]>;
};

interface Method {
    method(input: any, unneeded?: any): Promise<any>;
}

type AllUserRoutes<
    Handler extends Method,
    // @ts-expect-error: The input/output types are not used here. They don't matter.
    Routes extends { [key: string]: HandlerMapping<Handler> },
>  = {
    [K in keyof Routes]: Routes[K] extends Handler ?
        (input: Parameters<Routes[K]["method"]>[0]) => ReturnType<Routes[K]["method"]> :
        // @ts-expect-error: If this is hit, we cannot satisfy the handler type.
        AllUserRoutes<Handler, Routes[K]>;
};

type AuthenticatedMethodWrap<
    User,
    Routes extends { [key: string]: HandlerMapping<any> },
> =
    ((user: null) => AuthenticationUserNullRoutes<User, Routes>) &
    ((user: User) => AllUserRoutes<AuthenticatedRequestHandler<User, any, any>, Routes>);

type MethodInput<
    User,
    Routes extends { [key: string]: HandlerMapping<any> },
    AuthSet,
> =
    AuthSet extends true ?
        AuthenticatedMethodWrap<User, Routes> :
        () => AllUserRoutes<UnauthenticatedRequestHandler<any, any>, Routes>;

export default function<
    User,
    Routes extends { [key: string]: HandlerMapping<any> },
    AuthSet,
>(routes: Routes, authSet: AuthSet): MethodInput<User, Routes, AuthSet>;
