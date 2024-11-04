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

type AuthenticatedUserRoutes<
    Routes extends { [key: string]: HandlerMapping<AuthenticatedRequestHandler<any, any, any>> },
>  = {
    [K in keyof Routes]: Routes[K] extends AuthenticatedRequestHandler<any, any, any> ?
        (input: Parameters<Routes[K]["method"]>[0]) => ReturnType<Routes[K]["method"]> :
        // @ts-expect-error: If this is hit, we cannot satisfy the handler type.
        AuthenticatedUserRoutes<Routes[K]>;
};

type AuthenticatedMethodWrap<
    User,
    Routes extends { [key: string]: HandlerMapping<any> },
> =
    ((user: null) => AuthenticationUserNullRoutes<User, Routes>) &
    ((user: User) => AuthenticatedUserRoutes<Routes>);

type UnauthenticatedRoutes<
    Routes extends { [key: string]: HandlerMapping<UnauthenticatedRequestHandler<any, any>> },
>  = {
    [K in keyof Routes]: Routes[K] extends UnauthenticatedRequestHandler<any, any> ?
        (input: Parameters<Routes[K]["method"]>[0]) => ReturnType<Routes[K]["method"]> :
        // @ts-expect-error: If this is hit, we cannot satisfy the handler type.
        UnauthenticatedRoutes<Routes[K]>;
};

type MethodInput<
    User,
    Routes extends { [key: string]: HandlerMapping<any> },
    AuthSet,
> =
    AuthSet extends true ?
        AuthenticatedMethodWrap<User, Routes> :
        () => UnauthenticatedRoutes<Routes>;

export default function<
    User,
    Routes extends { [key: string]: HandlerMapping<any> },
    AuthSet,
>(routes: Routes, authSet: AuthSet): MethodInput<User, Routes, AuthSet>;
