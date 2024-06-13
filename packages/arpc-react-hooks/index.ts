import React from "react";

// Makes sure the input includes a batcher.
interface IncludesBatcher<BatchFn> {
    batch(fn: BatchFn, signal?: AbortSignal): any;
}

// Return the class atom for the API client.
export class APIClientAtom<
    Args extends any[],
    BatchFn extends (batcher: any) => any,
    Instance extends IncludesBatcher<BatchFn>,
    Constructor extends new (...args: Args) => Instance,
> {
    private _constructor: Constructor;
    private _instance: Instance;
    private _events = new Set<() => void>();

    constructor(constructor: Constructor, ...args: Args) {
        this._constructor = constructor;
        this._instance = new constructor(...args);
    }

    update(...args: Args) {
        this._instance = new this._constructor(...args);
        this._events.forEach((event) => event());
    }

    get() {
        return this._instance;
    }

    private _use() {
        return React.useSyncExternalStore(
            (subscribe) => {
                this._events.add(subscribe);
                return () => {
                    this._events.delete(subscribe);
                };
            },
            () => this._instance,
            () => this._instance,
        );
    }
}

// Return the return type of the get method.
type GetReturn<Atom extends APIClientAtom<any, any, any, any>> = ReturnType<Atom["get"]>;

// A low level hook to return the API client and re-render when it changes.
export function useClientAtomInstance<Atom extends APIClientAtom<any, any, any, any>>(atom: Atom): GetReturn<Atom> {
    // @ts-expect-error: This is a private API.
    return atom._use();
}

// Get the batcher function from a atom.
type BatcherFunction<T> = T extends APIClientAtom<any, infer BatchFn, any, any> ? BatchFn : never;

// Defines the internal type used for promise responses.
type InternalPromiseResult<T> = [T, undefined] | [undefined, Error];

// Defines a map to store the promise results.
const promiseResults = new Map<number, InternalPromiseResult<any>>();

// Defines the hook to make an async request.
function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
    // Get a ID tied to the lifecycle so we can track the promise. Note we can't use useEffect since otherwise we will be
    // setting in the render phase.
    const id = React.useMemo(() => Math.random(), deps);

    // If this is not the first render, we need to check if the promise is already resolved.
    const res = promiseResults.get(id);
    if (res) {
        // Delete it since this only fires once.
        promiseResults.delete(id);

        // Return the resolved promise.
        if (res[1]) throw res[1];
        return res[0] as T;
    }

    // Throw the promise so React suspends.
    throw fn().then((result) => {
        promiseResults.set(id, [result, undefined]);
    }).catch((error) => {
        promiseResults.set(id, [undefined, error]);
    });
}

// Defines what a internal cache value looks like.
type InternalCacheValue = [Promise<any>, number];

// Defines the internal cache.
const cache = new Map<any, Map<string, InternalCacheValue>>();

// Defines a hook to use the cache key or purge it.
function useCacheKey(client: any) {
    const cacheKey = React.useRef<string | undefined>();
    const purgeCacheKey = () => {
        if (cacheKey.current) {
            // Get the cache value and check if by removing one the number of references is zero.
            const clientMap = cache.get(client);
            if (!clientMap) return;
            const value = clientMap.get(cacheKey.current);
            if (value && --value[1] === 0) {
                // Delete the cache key if there are no references.
                clientMap.delete(cacheKey.current);

                // If there are no more cache keys, delete the client map.
                if (clientMap.size === 0) {
                    cache.delete(client);
                }
            }
        }
    };
    React.useEffect(() => purgeCacheKey, [client]);
    return [cacheKey, purgeCacheKey] as const;
}

// Defines the options for request based hooks.
export type RequestOptions = {
    /**
     * If set to true, the request will be re-run when the client changes. Defaults to true.
     */
    rerun?: boolean;

    /**
     * Defines the keys that are used to cache the request. Note that if the keys change, the request will be re-run.
     */
    cacheKeys?: string[];
};

// A hook to manage making a batch of API requests and then rerunning them when the client changes (unless turned off).
export function useRequestBatcher<
    Atom extends APIClientAtom<any, any, any, any>,
>(atom: Atom, fn: BatcherFunction<Atom>, options?: RequestOptions) {
    // Call the low level hook to get the client.
    const client = useClientAtomInstance(atom);

    // Defines the abort controller to cancel the batch.
    const controller = React.useMemo(() => new AbortController(), []);
    React.useEffect(() => () => controller.abort(), [controller]);

    // Get the cache key and purge function.
    const [cacheKey, purgeCacheKey] = useCacheKey(client);

    // Get the dependencies for the async hook.
    const deps: any[] = [options?.cacheKeys, options?.rerun, client];
    if (options?.rerun === false) {
        // If rerun is explicitly set to false, we need to pop client since we don't want to re-render.
        deps.pop();
    }

    // Call the async hook to make the request.
    return useAsync(async () => {
        // Call the batcher function.
        const batchInit = fn(client);
        const result = "then" in batchInit ? await batchInit : batchInit;

        // Build the cache key.
        const thisCacheKey = JSON.stringify([
            options?.cacheKeys,
            result,
        ]);
        let incr = false;
        if (cacheKey.current !== thisCacheKey) {
            // Purge our old cache key.
            purgeCacheKey();

            // Set the cache key.
            cacheKey.current = thisCacheKey;

            // If we have a cache value, we should increment the reference count.
            incr = true;
        }

        // Check if we have a cache value.
        const cacheValue = cache.get(client)?.get(thisCacheKey);
        if (cacheValue) {
            // Increment the reference count if we haven't already.
            if (incr) cacheValue[1]++;

            // Return the cache value.
            return cacheValue[0];
        }

        // Run the batcher function and return the promise.
        const p = client.batch(() => result, controller.signal);
        let clientsMap = cache.get(client);
        if (!clientsMap) {
            clientsMap = new Map();
            cache.set(client, clientsMap);
        }
        clientsMap.set(thisCacheKey, [p, 1]);
        return p;
    }, deps);
}

// A hook to manage making a single API request and then rerunning it when the client changes (unless turned off).
export function useRequest<
    Atom extends APIClientAtom<any, any, any, any>,
    Instance extends Exclude<GetReturn<Atom>, "batch">,
    MethodKey extends keyof Instance,
    Method extends Instance[MethodKey],
>(atom: Atom, key: MethodKey, arg: Parameters<Method>[0], options?: RequestOptions) {
    // Call the low level hook to get the client.
    const client = useClientAtomInstance(atom);

    // Defines the abort controller to cancel the request.
    const controller = React.useMemo(() => new AbortController(), []);
    React.useEffect(() => () => controller.abort(), [controller]);

    // Get the cache key and purge function.
    const [cacheKey, purgeCacheKey] = useCacheKey(client);

    // Get the dependencies for the async hook.
    const deps: any[] = [options?.cacheKeys, options?.rerun, client];
    if (options?.rerun === false) {
        // If rerun is explicitly set to false, we need to pop client since we don't want to re-render.
        deps.pop();
    }

    // Call the async hook to make the request.
    return useAsync(async () => {
        // Call the method.
        const result = client[key](arg, controller.signal);

        // Build the cache key.
        const thisCacheKey = JSON.stringify([
            options?.cacheKeys,
            key,
            arg,
            result,
        ]);
        let incr = false;
        if (cacheKey.current !== thisCacheKey) {
            // Purge our old cache key.
            purgeCacheKey();

            // Set the cache key.
            cacheKey.current = thisCacheKey;

            // If we have a cache value, we should increment the reference count.
            incr = true;
        }

        // Check if we have a cache value.
        const cacheValue = cache.get(client)?.get(thisCacheKey);
        if (cacheValue) {
            // Increment the reference count if we haven't already.
            if (incr) cacheValue[1]++;

            // Return the cache value.
            return cacheValue[0];
        }

        // Run the method and return the promise.
        const p = result;
        let clientsMap = cache.get(client);
        if (!clientsMap) {
            clientsMap = new Map();
            cache.set(client, clientsMap);
        }
        clientsMap.set(thisCacheKey, [p, 1]);
        return p;
    }, deps);
}
