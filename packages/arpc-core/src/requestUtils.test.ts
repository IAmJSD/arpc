import { describe, it, expect } from "vitest";
import { findRoute } from "./requestUtils";
import { string } from "valibot";

const routes = {
    skibidi: {
        toilet: {
            input: string(),
            output: string(),
            method: async (input: string) => input,
        },
    },
} as const;

describe("findRoute", () => {
    it("handles empty strings", () => {
        expect(findRoute("", routes)).toBeNull();
    });

    it("handles object being fetched", () => {
        expect(findRoute("skibidi", routes)).toBeNull();
    });

    it("finds the route properly", () => {
        expect(findRoute("skibidi.toilet", routes)).not.toBeNull();
    });
});
