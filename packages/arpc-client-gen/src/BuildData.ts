export type Exception = {
    name: string;
    description: string;
};

export type ObjectSignature = {
    type: "object";
    key: string;
};

export type LiteralType = string | number | bigint | boolean | null;

export type Signature = {
    type: "string" | "number" | "bigint" | "boolean";
} | {
    type: "nullable";
    inner: Signature;
} | {
    type: "array";
    inner: Signature;
} | {
    type: "union";
    inner: Signature[];
} | {
    type: "map";
    key: Signature;
    value: Signature;
} | ObjectSignature | {
    type: "enum_key";
    enum: string;
} | {
    type: "enum_value";
    enum: string;
} | {
    type: "literal";
    value: LiteralType;
};

export type Enum = {
    name: string;
    valueType: Signature;
    data: Map<any, any>;
};

export type Method = {
    input: { name: string; signature: Signature; } | null;
    output: Signature;
    description: string | null;
    mutation: boolean;
};

export type Methods = {
    [key: string]: Method | Methods;
};

export type Client = {
    apiVersion: `v${string}`;
    methods: Methods;
    description: string | null;
    defaultProtocol: string;
    defaultHostname: string;
    authentication: {
        tokenTypes: { [humanName: string]: string };
        defaultTokenType?: string;
    } | null;
};

export type Object = {
    name: string;
    fields: { [key: string]: Signature; };
};

export type BuildData = {
    enums: Enum[];
    objects: Object[];
    builtinExceptions: Exception[];
    customExceptions: Exception[];
    clients: Client[];
};
