import { string } from "valibot";
import { describe, it, expect } from "vitest";
import selfClient from "./selfClient";

const unauthenticatedRoutes = {
    skibidi: {
        toilet: {
            input: string(),
            output: string(),
            method: async (input: string) => input,
        },
    },
} as const;

type User = {
    breed: string;
};

const authenticatedRoutes = {
    puppy: {
        friends: {
            input: string(),
            output: string(),
            method: async (input: string, user: User | null) => input,
            authenticated: false,
        },
        enemies: {
            input: string(),
            output: string(),
            method: async (input: string, user: User) => {
                if (user.breed !== "poodle") {
                    throw new Error("Only poodles are allowed to see my enemies :3");
                }

                return input;
            },
        },
    }
} as const;

describe("selfClient", () => {
    it("supports unauthenticated handlers", async () => {
        const client = selfClient<
            unknown, typeof unauthenticatedRoutes, false
        >(unauthenticatedRoutes, false);

        // @ts-expect-error: No user is allowed.
        client({});

        await expect(
            // @ts-expect-error: Type is wrong.
            client().skibidi.toilet(1),
        ).rejects.toThrow("Invalid type: Expected string but received 1");

        expect(await client().skibidi.toilet("hello")).toBe("hello");
    });

    describe("authenticated handlers", () => {
        it("handles unauthenticated endpoints", async () => {
            const client = selfClient<User, typeof authenticatedRoutes, true>(authenticatedRoutes, true);

            // @ts-expect-error: Type is wrong.
            client();

            await expect(
                // @ts-expect-error: Type is wrong.
                client(null).puppy.friends(1),
            ).rejects.toThrow("Invalid type: Expected string but received 1");

            expect(await client(null).puppy.friends("hello")).toBe("hello");
            expect(await client({ breed: "poodle" }).puppy.friends("hello")).toBe("hello");
        });

        it("handles authenticated endpoints", async () => {
            const client = selfClient<unknown, typeof authenticatedRoutes, true>(authenticatedRoutes, true);

            // @ts-expect-error: This should be uncallable.
            await client(null).puppy.enemies("hello").catch(() => {});

            expect(await client({ breed: "poodle" }).puppy.enemies("hello")).toBe("hello");
            await expect(client({ breed: "cockapoo" }).puppy.enemies("hello")).rejects.toThrow(
                "Only poodles are allowed to see my enemies :3",
            );
        });

        it("disallows setting values", () => {
            const client = selfClient<User, typeof authenticatedRoutes, true>(authenticatedRoutes, true);

            try {
                // @ts-expect-error: This should be uncallable.
                client().puppy.enemies = "hello";
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
            }
        });
    });
});
