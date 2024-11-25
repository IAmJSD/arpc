/** Defines the error that is thrown when you are ratelimited. */
export class Ratelimited extends Error {
    public readonly code: string;
    public readonly body: any;

    constructor(message: string, body: any) {
        super(message);
        this.code = "RATELIMITED";
        this.body = body;
    }
}

/** Defines the rate limiting middleware. */
export type RateLimitingMiddleware<User, AuthSet> = AuthSet extends true ?
    (methodName: string, arg: any, user: User) => Promise<void> :
    (methodName: string, arg: any) => Promise<void>;
