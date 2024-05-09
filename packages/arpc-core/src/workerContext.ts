// @ts-ignore: Some TS environments do not support this.
import type { AsyncLocalStorage as AsyncLocalStorageType } from "node:async_hooks";

let lastWorker = 0;

// Where compatible, use the async local storage.
let storage: AsyncLocalStorageType<Map<any, any>> | null = null;
(async () => {
    const doNotBundleThis = (f: string) => {
        /* webpackIgnore: true */
        return import(/* webpackIgnore: true */ f);
    };
    const i = await doNotBundleThis("node:async_hooks");
    storage = new i.AsyncLocalStorage();
})().catch(() => {});

// This map is used for compatibility with the worker context.
const map_: Map<number, Map<any, any>> = new Map();

export function taintWithWorkerContext<T>(fn: () => Promise<T>): Promise<T> {
    const w = lastWorker++;

    // Try to use the async local storage.
    if (storage) {
        return storage.run(new Map(), fn);
    }

    // Use stack poisoning on worker functions.
    const name = `$ARPCWorker${w}`;
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
    const match = stack.match(/\$ARPCWorker([0-9]+)/gm);
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
