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

interface DBTransaction {
    commit(): any;
    rollback(): any;
}

const _dbTxMagicKey = Symbol("arpcDBTx");

// Defines a function to start a database transaction, or fetch the current one if the transaction creation
// function was passed in before within the current request (either single or within a batch). Note for this,
// it is important you pass in the same function reference in each call.
export function databaseTransaction<
    Tx extends DBTransaction, TxReturn extends Promise<Tx> | Tx,
>(creator: () => TxReturn): TxReturn {
    // Get the worker context.
    const ctx = workerContext();
    if (!ctx) {
        throw new Error("databaseTransaction() was requested outside of a arpc worker context");
    }

    // Get the map that holds functions -> transactions for this request.
    let m: Map<any, any> = ctx.get(_dbTxMagicKey);
    if (!m) {
        m = new Map();
        ctx.set(_dbTxMagicKey, m);
    }

    // Try to get the transaction from a previous call.
    let tx = m.get(creator);
    if (tx) return tx;

    // Create the transaction.
    tx = creator();
    if ("then" in tx) {
        function caller(key: string) {
            return async () => {
                if (tx === null) {
                    // This means the transaction was already committed or rolled back.
                    return;
                }
                let t: any;
                try {
                    t = await tx;
                } catch {
                    // Would have failed in the call anyway.
                    return;
                }
                await t[key]();
            };
        }
        commit(caller("commit"));
        rollback(caller("rollback"));
    } else {
        function caller(key: string) {
            return async () => {
                if (tx === null) {
                    // This means the transaction was already committed or rolled back.
                    return;
                }
                tx[key]();
            };
        }
        commit(caller("commit"));
        rollback(caller("rollback"));
    }

    // Create a proxy to handle manual commits and rollbacks.
    const commitProxy = new Proxy(tx.commit, {
        apply(target, thisArg, args) {
            m.delete(creator);
            tx = null;
            return target.apply(thisArg, args);
        },
    });
    const rollbackProxy = new Proxy(tx.rollback, {
        apply(target, thisArg, args) {
            m.delete(creator);
            tx = null;
            return target.apply(thisArg, args);
        },
    });
    const txProxy = new Proxy(tx, {
        get(target, key) {
            if (key === "commit") {
                return commitProxy;
            } else if (key === "rollback") {
                return rollbackProxy;
            }

            return target[key];
        },
    });

    // Store the transaction proxy and return it.
    m.set(creator, txProxy);
    return txProxy;
}
