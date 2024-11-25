import { _txMagicKey } from "./request";
import { describe, it, expect } from "vitest";
import { addErrorChecks } from "./tests/utils/errorChecks";
import { useCommit, useDatabaseTransaction, useRollback } from "./transactions";
import { taintWithWorkerContext } from "./workerContext";

describe("useCommit", () => {
    addErrorChecks(
        "useCommit", async () => useCommit(() => Promise.resolve()),
    );

    it("should create the transaction context", () => {
        const ctx = new Map<any, any>();
        const cb = () => Promise.resolve();
        return taintWithWorkerContext(ctx, async () => {
            useCommit(cb);
            expect(ctx.get(_txMagicKey)).toEqual([[cb], []]);
        });
    });

    it("should add a commit function to the transaction context", async () => {
        const cb1 = () => Promise.resolve();
        const cb2 = () => Promise.resolve();
        const ctx = new Map<any, any>([[_txMagicKey, [[cb1], []]]]);
        taintWithWorkerContext(ctx, async () => {
            useCommit(cb2);
            expect(ctx.get(_txMagicKey)).toEqual([[cb1, cb2], []]);
        });
    });
});

describe("useRollback", () => {
    addErrorChecks(
        "useRollback", async () => useRollback(() => Promise.resolve()),
    );

    it("should create the transaction context", () => {
        const ctx = new Map<any, any>();
        const cb = () => Promise.resolve();
        return taintWithWorkerContext(ctx, async () => {
            useRollback(cb);
            expect(ctx.get(_txMagicKey)).toEqual([[], [cb]]);
        });
    });

    it("should add a rollback function to the transaction context", async () => {
        const cb1 = () => Promise.resolve();
        const cb2 = () => Promise.resolve();
        const ctx = new Map<any, any>([[_txMagicKey, [[], [cb1]]]]);
        taintWithWorkerContext(ctx, async () => {
            useRollback(cb2);
            expect(ctx.get(_txMagicKey)).toEqual([[], [cb1, cb2]]);
        });
    });
});

class MockTx {
    commitCount = 0;
    rollbackCount = 0;

    commit() {
        this.commitCount++;
    }

    rollback() {
        this.rollbackCount++;
    }

    bark() {
        return "WOOF" as const;
    }
}

describe("useDatabaseTransaction", () => {
    addErrorChecks(
        "useDatabaseTransaction",
        async () => useDatabaseTransaction(() => Promise.resolve(new MockTx())),
    );

    it("hooks commit and rollback properly", () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            // Check the commit/rollback is written properly.
            const tx = await useDatabaseTransaction(() => Promise.resolve(new MockTx()));
            const txCtx: [() => Promise<void>[], () => Promise<void>[]] = ctx.get(_txMagicKey);
            expect(txCtx[0].length).toEqual(1);
            expect(txCtx[1].length).toEqual(1);
            expect(tx.commitCount).toEqual(0);
            expect(tx.rollbackCount).toEqual(0);

            // Commit the transaction.
            await txCtx[0][0]();
            expect(tx.commitCount).toEqual(1);
            expect(tx.rollbackCount).toEqual(0);

            // Rollback the transaction.
            await txCtx[1][0]();
            expect(tx.commitCount).toEqual(1);
            expect(tx.rollbackCount).toEqual(1);
        });
    });

    it("commit function on transaction handles it immediately", () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const tx = await useDatabaseTransaction(() => Promise.resolve(new MockTx()));
            tx.commit();
            const txCtx: [() => Promise<void>[], () => Promise<void>[]] = ctx.get(_txMagicKey);
            await txCtx[0][0]();
            await txCtx[1][0]();
            expect(tx.commitCount).toEqual(1);
            expect(tx.rollbackCount).toEqual(0);
        });
    });

    it("rollback function on transaction handles it immediately", () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const tx = await useDatabaseTransaction(() => Promise.resolve(new MockTx()));
            tx.rollback();
            const txCtx: [() => Promise<void>[], () => Promise<void>[]] = ctx.get(_txMagicKey);
            await txCtx[0][0]();
            await txCtx[1][0]();
            expect(tx.commitCount).toEqual(0);
            expect(tx.rollbackCount).toEqual(1);
        });
    });

    it("returns a transaction that feels unmodified", () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const tx = await useDatabaseTransaction(() => Promise.resolve(new MockTx()));
            expect(tx.bark()).toEqual("WOOF");
        });
    });

    it("handles synchronous transactions", async () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const tx = useDatabaseTransaction(() => new MockTx());
            expect(tx.bark()).toEqual("WOOF");
            const txCtx: [() => Promise<void>[], () => Promise<void>[]] = ctx.get(_txMagicKey);
            expect(txCtx[0].length).toEqual(1);
            expect(txCtx[1].length).toEqual(1);
        });
    });

    it("caches the transaction", () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const cb = () => new MockTx();
            useDatabaseTransaction(cb);
            useDatabaseTransaction(cb);
            const txCtx: [() => Promise<void>[], () => Promise<void>[]] = ctx.get(_txMagicKey);
            expect(txCtx[0].length).toEqual(1);
            expect(txCtx[1].length).toEqual(1);
        });
    });
});
