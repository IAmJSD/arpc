import z from "zod";

// Defines a unauthenticated RPC request handler.
export type UnauthenticatedRequestHandler<
    InputSchema extends z.ZodType<any, any, any>,
    OutputSchema extends z.ZodType<any, any, any>,
> = {
    // Defines if this request handler does a mutation. If this is unset,
    // defaults to true.
    mutation?: boolean;

    // Defines if this should run in parallel in batch jobs. If this is unset,
    // defaults to false.
    parallel?: boolean;

    // Defines the input schema for this handler.
    input: InputSchema;

    // Defines the output schema for this handler.
    output: OutputSchema;

    // Defines the method that will be called when this handler is invoked.
    method: (input: z.infer<InputSchema>) => Promise<z.infer<OutputSchema>>;
};

// Handle authenticated requests.
export type AuthenticatedRequestHandler<
    User,
    InputSchema extends z.ZodType<any, any, any>,
    OutputSchema extends z.ZodType<any, any, any>,
> = Omit<UnauthenticatedRequestHandler<InputSchema, OutputSchema>, "method"> & ({
    // Defines the method that will be called when this handler is invoked.
    method: (input: z.infer<InputSchema>, user: User) => Promise<z.infer<OutputSchema>>;

    // Defines if the user must be authenticated to use this handler. If this is
    // unset, defaults to true.
    authenticated?: true;
} | {
    // Defines the method that will be called when this handler is invoked.
    method: (input: z.infer<InputSchema>, user: User | null) => Promise<z.infer<OutputSchema>>;

    // Defines if the user must be authenticated to use this handler. If this is unset, defaults to true.
    authenticated: false;
});

// Defines a mapping that either points to more mappings or a handler.
export type HandlerMapping<
    Handler extends UnauthenticatedRequestHandler<any, any> | AuthenticatedRequestHandler<any, any, any>,
> = Handler | {
    [key: string]: HandlerMapping<Handler>;
};

// Defines authentication handling.
export type AuthHandler<User, TokensEnum> = {
    // Defines the enum that deterimines the token type.
    TokenTypes: TokensEnum;

    // Defines the default token type.
    defaultTokenType?: TokensEnum[keyof TokensEnum];

    // Defines the method that will be called when a token is validated. If the user is invalid,
    // this should return null.
    validate: (token: string, tokenType: TokensEnum[keyof TokensEnum]) => Promise<User | null>;
};
