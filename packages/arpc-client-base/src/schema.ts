type RouteShared = {
    mutation: true | false;
    $input: any;
    $output: any;
};

export type AuthRouteMapping = ({
    authenticated: true | false;
} & RouteShared) | { [key: string]: AuthRouteMapping };

export type BodyErrorConstructor = new (body: any) => Error;

type SchemaShared<
    Exceptions extends { [key: string]: BodyErrorConstructor },
> = {
    // Defines the API version.
    version: `v${string}`;

    // Defines the hostname. If this is null, the client will use the current hostname.
    hostname: string | null;

    // Defines the exceptions.
    exceptions: Exceptions;
};

export type AuthenticatedSchema<
    TokensEnum,
    Exceptions extends { [key: string]: BodyErrorConstructor },
    Routes extends AuthRouteMapping,
> = {
    // Defines the enum that deterimines the token type.
    TokenTypes: TokensEnum;

    // Defines the default token type.
    defaultTokenType?: TokensEnum[keyof TokensEnum];

    // Defines the routes.
    routes: Routes;
} & SchemaShared<Exceptions>;

export type NoAuthRouteMapping = RouteShared | { [key: string]: NoAuthRouteMapping };

export type UnauthenticatedSchema<
    Exceptions extends { [key: string]: BodyErrorConstructor },
    Routes extends NoAuthRouteMapping,
> = {
    // Defines the routes.
    routes: Routes;
} & SchemaShared<Exceptions>;

export type Schema<Schema> = Schema extends AuthenticatedSchema<infer TokensEnum, infer Exceptions, infer Routes> ?
    AuthenticatedSchema<TokensEnum, Exceptions, Routes> :
        Schema extends UnauthenticatedSchema<infer Exceptions, infer Routes> ?
            UnauthenticatedSchema<Exceptions, Routes> :
                never;
