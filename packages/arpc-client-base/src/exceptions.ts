export class Exception<Code extends string, Body = unknown> extends Error {
    constructor(public code: Code, public message: string, public body: Body) {
        super(message);
    }
}

export class InvalidResponse extends Exception<"INVALID_RESPONSE"> {}
