// Defines the error that is thrown when you are ratelimited.
export class Ratelimited extends Error {
    public readonly code: string;
    public readonly body: any;

    constructor(message: string, body: any) {
        super(message);
        this.code = "RATELIMITED";
        this.body = body;
    }
}

// Defines a in-memory bucket.
export class InMemoryBucket<Key> {
    private readonly _map: Map<Key, [number, number]> = new Map();

    constructor(
        public readonly max: number,
        public readonly intervalMilliseconds: number,
        public readonly bucketName: string,
    ) {}

    use(key: Key) {
        // Get the map entry.
        let a = this._map.get(key);
        if (!a) {
            // Create a new entry.
            a = [0, Date.now()];
            this._map.set(key, a);

            // Set a timeout to remove the entry.
            setTimeout(() => {
                this._map.delete(key);
            }, this.intervalMilliseconds);
        }

        // Update the entry if we aren't ratelimited.
        if (this.max >= a[0]) a[0]++;

        // Throw if we are ratelimited.
        if (this.max < a[0]) {
            throw new Ratelimited("You have been ratelimited!", {
                expiresAt: a[1] + this.intervalMilliseconds,
                bucketName: this.bucketName,
            });
        }
    }
}

// Defines the rate limiting middleware.
export type RateLimitingMiddleware<User, AuthSet> = AuthSet extends true ?
    (methodName: string, arg: any, user: User) => Promise<void> :
    (methodName: string, arg: any) => Promise<void>;
