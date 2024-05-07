import {
    AuthRouteMapping, AuthenticatedSchema,
    NoAuthRouteMapping, Schema, UnauthenticatedSchema,
} from "./schema";

type Outputs<A extends { $output: any }[]> = [A[number]["$output"]];

export type AuthenticatedClientTypes<
    Routes extends AuthRouteMapping,
    Authenticated extends boolean,
    IsPromise extends boolean,
> = {
    [K in keyof Routes]: Routes[K] extends { authenticated: infer RouteAuthenticated; mutation: true | false; $input: infer Input; $output: infer Output } ?
        Authenticated extends true ?
        (input: Input) => IsPromise extends true ? Promise<Output> : Output :
                RouteAuthenticated extends false ?
                    (input: Input) => IsPromise extends true ? Promise<Output> : Output :
                    never
    // @ts-expect-error: This is a recursive type.
    : AuthenticatedClientTypes<Routes[K], Authenticated, IsPromise>;
};

export type NoAuthClientTypes<
    Routes extends NoAuthRouteMapping,
    IsPromise extends boolean,
> = {
    [K in keyof Routes]: Routes[K] extends { mutation: true | false; $input: infer Input; $output: infer Output } ?
        (input: Input) => IsPromise extends true ? Promise<Output> : Output :
        Routes[K] extends NoAuthRouteMapping ?
        NoAuthClientTypes<Routes[K], IsPromise> :
            never;
};

export type ClientTypes<S extends Schema<any>, Authenticated extends boolean, IsPromise extends boolean> =
    S extends Schema<infer Schema> ?
        Schema extends AuthenticatedSchema<any, any, infer Routes> ?
            AuthenticatedClientTypes<Routes, Authenticated, IsPromise> :
            Schema extends UnauthenticatedSchema<any, infer Routes> ?
                NoAuthClientTypes<Routes, IsPromise> :
                {}
    : {};

// Note that this type isn't entirely accurate. TS doesn't make it simple to capture elements that are added to the
// instance during construction. This is the best we can do.
export class BaseClient<S extends Schema<any>, Authenticated extends boolean> {
    private _schema: S;
    private _token: string | undefined;
    private _tokenType: string | undefined;
    private _stubs: any;

    constructor(schema: S, token?: string, tokenType?: string);

    private _processException(body: {
        builtIn: true;
        name: string;
        code: string;
        message: string;
    } | {
        builtIn: false;
        name: string;
        body: any;
    });
    private _executeOne(route: string, mutation: boolean, arg: any): Promise<any>;

    batch<
        A extends {
            methodName: string;
            arg: any;
            $output: any;
            mutation: boolean;
        }[],
    >(fns: (client: ClientTypes<S, Authenticated, false>) => Promise<A> | A): Promise<Outputs<A>>;
}
