import type { Enum, Object, Signature } from "@arpc/client-gen";
import z from "zod";

export function getZodInputSignature(
    schema: z.ZodType<any, any, any>, enums: Enum[],
    objects: Object[], uniqueNames: Set<string>, getName: () => string,
): Signature {
    
}
