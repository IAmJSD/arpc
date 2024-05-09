import { _txMagicKey } from "./request";
import { workerContext } from "./workerContext";

// Defines a function to commit.
export function commit(fn: () => Promise<void>) {
    const ctx = workerContext();
    if (!ctx) {
        throw new Error("commit() was requested outside of a arpc worker context");
    }
    let a: [(() => Promise<void>)[], (() => Promise<void>)[]] = ctx.get(_txMagicKey);
    if (!a) {
        a = [[], []];
        ctx.set(_txMagicKey, a);
    }
    a[0].push(fn);
}

// Defines a function to rollback.
export function rollback(fn: () => Promise<void>) {
    const ctx = workerContext();
    if (!ctx) {
        throw new Error("rollback() was requested outside of a arpc worker context");
    }
    let a: [(() => Promise<void>)[], (() => Promise<void>)[]] = ctx.get(_txMagicKey);
    if (!a) {
        a = [[], []];
        ctx.set(_txMagicKey, a);
    }
    a[1].push(fn);
}
