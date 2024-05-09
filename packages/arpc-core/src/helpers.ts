import { _requestMagicKey } from "./request";
import { workerContext } from "./workerContext";

// Get the request from the current arpc worker context.
export function request(): Request {
    const ctx = workerContext();
    if (!ctx) {
        throw new Error("request() was requested outside of a arpc worker context");
    }

    return ctx.get(_requestMagicKey);
}

// Defines a map which you can use to store data in the current arpc worker context.
const _mapMagicKey = Symbol("arpcMap");
export function context(): Map<any, any> {
    const ctx = workerContext();
    if (!ctx) {
        throw new Error("context() was requested outside of a arpc worker context");
    }

    // Get the map from the context.
    let map = ctx.get(_mapMagicKey);
    if (!map) {
        map = new Map();
        ctx.set(_mapMagicKey, map);
    }
    return map;    
}
