import { describe, it, expect, test } from "vitest";
import { storagePromise, taintWithWorkerContext } from "./workerContext";
import { alreadyDeduped, dedupe, getUnderlyingDedupeFunction } from "./dedupe";

describe("dedupe", () => {
    let num = 0;
    const incrementNumber = dedupe(async (by: number, _random?: number) => {
        num += by;
        return num;
    });

    it("doesn't break attributes", () => {
        expect(incrementNumber.toString()).toBeTypeOf("string");
    });

    it("caches in worker context", async () => {
        await storagePromise;
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const result = await incrementNumber(1);
            expect(result).toBe(1);
            const result2 = await incrementNumber(1);
            expect(result2).toBe(1);
        });
    });

    it("handles different arguments", async () => {
        await storagePromise;
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const result = await incrementNumber(2);
            expect(result).toBe(3);
            const result2 = await incrementNumber(3);
            expect(result2).toBe(6);
            const result3 = await incrementNumber(3);
            expect(result3).toBe(6);
        });
    });

    it("handles argument count differences", async () => {
        await storagePromise;
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const result = await incrementNumber(2);
            expect(result).toBe(8);
            const result2 = await incrementNumber(3);
            expect(result2).toBe(11);
            const result3 = await incrementNumber(3, 0);
            expect(result3).toBe(14);
        });
    });

    it("handles no worker context", async () => {
        const result = await incrementNumber(1);
        expect(result).toBe(15);
    });
});

describe("alreadyDeduped", () => {
    const dummyFunction = dedupe(async (_number?: number) => 1);

    it("handles worker context", async () => {
        await storagePromise;
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            expect(alreadyDeduped(dummyFunction)).toBe(false);
            await dummyFunction();
            expect(alreadyDeduped(dummyFunction)).toBe(true);

            expect(alreadyDeduped(dummyFunction, 2)).toBe(false);
            await dummyFunction(2);
            expect(alreadyDeduped(dummyFunction, 2)).toBe(true);

            expect(alreadyDeduped(dummyFunction, 1)).toBe(false);
            await dummyFunction(1);
            expect(alreadyDeduped(dummyFunction, 1)).toBe(true);
        });
    });

    it("never caches without worker context", async () => {
        await storagePromise;
        await dummyFunction();
        expect(alreadyDeduped(dummyFunction)).toBe(false);
        await dummyFunction(1);
        expect(alreadyDeduped(dummyFunction, 1)).toBe(false);
    });
});

test("getUnderlyingDedupeFunction handles non-deduped functions", () => {
    const fn = async () => 1;
    expect(getUnderlyingDedupeFunction(fn)).toBe(fn);
});
