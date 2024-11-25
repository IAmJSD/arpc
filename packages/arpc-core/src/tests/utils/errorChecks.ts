import { it, expect } from "vitest";

export function addErrorChecks<
    Args extends any[],
    T extends (...args: Args) => Promise<any>,
>(name: string, fn: T, ...args: Args) {
    it("errors when no worker context is present", async () => {
        await expect(fn(...args)).rejects.toThrow(
            `${name}() was requested outside of a arpc worker context`,
        );
    });
}
