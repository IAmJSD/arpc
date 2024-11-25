import { describe, it, expect } from "vitest";
import { RPCRouter } from "./router";
import { string } from "valibot";

describe("RPCRouter", () => {
    it("adds a ratelimiting handler properly", () => {
        const router = new RPCRouter().setRateLimiting(async () => {});
        // @ts-expect-error: _ratelimiting is private.
        expect(router._ratelimiting).not.toBeNull();
    });

    it("adds exceptions properly", () => {
        const router = new RPCRouter().setExceptions({});
        // @ts-expect-error: _exceptions is private.
        expect(router._exceptions).not.toBeNull();
    });

    it("creates a authenticated self client properly", async () => {
        await expect(
            new RPCRouter().setAuthHandler({
                TokenTypes: {
                    BEARER: "Bearer",
                },
                validate: async (token: string) => {
                    return token === "hello" ? "user" : null;
                },
            }).setRoutes({
                skibidi: {
                    toilet: {
                        input: string(),
                        output: string(),
                        method: async (input: string) => input,
                    },
                },
            }).self("user").skibidi.toilet("hello")
        ).resolves.toEqual("hello");
    });

    it("creates a un-authenticated self client properly", async () => {
        await expect(
            new RPCRouter().setRoutes({
                skibidi: {
                    toilet: {
                        input: string(),
                        output: string(),
                        method: async (input: string) => input,
                    },
                },
            }).self().skibidi.toilet("hello")
        ).resolves.toEqual("hello");
    });
});
