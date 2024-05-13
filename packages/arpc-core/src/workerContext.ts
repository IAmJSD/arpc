// @ts-ignore: Some TS environments do not support this.
import type { AsyncLocalStorage } from "node:async_hooks";

// Where compatible, use the async local storage.
let storage: AsyncLocalStorage<Map<any, any>> | null = null;
export const storagePromise = (async () => {
    const doNotBundleThis = (f: string): Promise<any> => {
        /* webpackIgnore: true */
        return import(/* webpackIgnore: true */ f);
    };
    const i = await doNotBundleThis("node:async_hooks");
    storage = new i.AsyncLocalStorage();
})().catch(() => {});

// This map and number is used for compatibility with the worker context.
const map_: Map<number, Map<any, any>> = new Map();
let lastWorker = 0;

export function taintWithWorkerContext<T>(initMap: Map<any, any>, fn: () => Promise<T>): Promise<T> {
    // Try to use the async local storage.
    if (storage) {
        return storage.run(initMap, fn);
    }

    // Use stack poisoning on worker functions.
    const w = lastWorker++;
    const name = `$ARPCWorker${w}`;
    map_.set(w, initMap);
    const obj = {
        async [name]() {
            try {
                return await fn();
            } finally {
                map_.delete(w);
            }
        },
    };
    return obj[name]();
}

const WORKER_STACK_REGEX = /\$ARPCWorker([0-9]+)/gm;

export function workerContext() {
    // Try to use the async local storage.
    if (storage) {
        return storage.getStore() || null;
    }

    // Use the stack poisoning method to get the worker number.
    let stack: string | undefined;
    try {
        // Throw an error so the stack is captured.
        throw new Error();
    } catch (e) {
        // Get the current stack.
        stack = (e as Error).stack;
        if (stack === undefined) return null;
    }

    // Get the worker number.
    const match = WORKER_STACK_REGEX.exec(stack);
    if (match) {
        const id = parseInt(match[1]);
        let m = map_.get(id);
        if (m) return m;
        m = new Map();
        map_.set(id, m);
        return m;
    }
    return null;
}
