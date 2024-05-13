import z from "zod";

export const schema = z.boolean();

type MyAwesomeInput = z.infer<typeof schema>;

export function method(input: MyAwesomeInput) {
    return false;
}
