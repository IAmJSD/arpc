import { BaseClient, ClientTypes } from "./BaseClient";
import { AuthenticatedSchema, Schema, UnauthenticatedSchema } from "./schema";

// Defines the client type.
export type ClientType<
    S extends Schema<any>, Authenticated extends boolean,
> = BaseClient<S, Authenticated> & ClientTypes<S, Authenticated, false>;

// Defines the token type.
type TokenType<S extends Schema<any>> = S extends Schema<infer Schema> ?
    Schema extends AuthenticatedSchema<infer TokensEnum, any, any> ?
        Schema["defaultTokenType"] extends undefined ?
            TokensEnum[keyof TokensEnum] | undefined :
            TokensEnum[keyof TokensEnum]
        :
    never :
never;

// Unauthenticated schema types.
export function buildClient<
    S extends Schema<UnauthenticatedSchema<any, any>>,
>(schema: S): ClientType<S, false>;
export function buildClient<
    S extends Schema<AuthenticatedSchema<any, any, any>>,
>(schema: S): ClientType<S, false>;

// Authenticated schema type.
export function buildClient<
    S extends Schema<AuthenticatedSchema<any, any, any>>,
>(schema: S, token: string, tokenType: TokenType<S>): ClientType<S, true>;
