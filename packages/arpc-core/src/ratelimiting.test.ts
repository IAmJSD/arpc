import { test, expect } from "vitest";
import { Ratelimited } from "./ratelimiting";

test("Ratelimited gets constructed properly", () => {
    const err = new Ratelimited("test", {
        cat: ":3",
    });
    expect(err.message).toBe("test");
    expect(err.code).toBe("RATELIMITED");
    expect(err.body).toEqual({ cat: ":3" });
});
