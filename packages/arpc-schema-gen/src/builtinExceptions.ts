import { Exception } from "@arpc-packages/client-gen";

export const builtinExceptions: Exception[] = [
    // InvalidResponse is added in the client generator.

    {
        name: "BadRequest",
        description: "Thrown when a request is invalid.",
    },
    {
        name: "Ratelimited",
        description: "Thrown when a user is ratelimited.",
    },
    {
        name: "Unauthorized",
        description: "Thrown when a user is not authorized.",
    },
    {
        name: "InternalServerError",
        description: "Thrown when the server encounters an internal error.",
    },
];
