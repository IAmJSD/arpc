import React from "react";

// Extracts the instance type from a class constructor.
type ExtractInstance<T> = T extends new (...args: any) => infer R ? R : never;

// Makes sure the input includes a batcher.
interface IncludesBatcher<BatchFn> {
    batch(fn: BatchFn, signal?: AbortSignal): any;
}

// Return the class atom for the API client.
export class APIClientAtom<
    Args extends any[],
    BatchFn extends (batcher: any) => any,
    Constructor extends new (...args: Args) => IncludesBatcher<BatchFn>,
> {
    private _constructor: Constructor;
    private _instance: ExtractInstance<Constructor>;
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
type GetReturn<Atom extends APIClientAtom<any, any, any>> = ReturnType<Atom["get"]>;

// A low level hook to return the API client and re-render when it changes.
export function useClientAtomInstance<Atom extends APIClientAtom<any, any, any>>(atom: Atom): GetReturn<Atom> {
    // @ts-expect-error: This is a private API.
    return atom._use();
}

// Get the batcher function from a atom.
type BatcherFunction<T> = T extends APIClientAtom<any, infer BatchFn, any> ? BatchFn : never;

// A hook to manage making a batch of API requests and then rerunning them when the client changes (unless turned off).
export function useRequestBatcher<
    Atom extends APIClientAtom<any, any, any>,
>(atom: Atom, batcher: BatcherFunction<Atom>, rerun?: boolean) {
    // Call the low level hook to get the client.
    const client = useClientAtomInstance(atom);


}
