import { describe, it, expect } from "vitest";
import { addErrorChecks } from "./tests/utils/errorChecks";
import { useContext, useRequest } from "./helpers";
import { _requestMagicKey } from "./request";
import { taintWithWorkerContext } from "./workerContext";

describe("useRequest", () => {
    addErrorChecks("useRequest", async () => useRequest());
    it("returns the request", () => {
        const req = new Request("https://example.com");
        const ctx = new Map<any, any>([
            [_requestMagicKey, req],
        ]);
        return taintWithWorkerContext(ctx, async () => {
            expect(useRequest()).toEqual(req);
        });
    });
});

describe("useContext", () => {
    addErrorChecks("useContext", async () => useContext());
    it("returns the exposed context", () => {
        const ctx = new Map<any, any>();
        return taintWithWorkerContext(ctx, async () => {
            const map = useContext();
            if (!(map instanceof Map)) {
                throw new Error("useContext() did not return a Map");
            }
            expect(useContext()).toBe(map);
        });
    });
});
