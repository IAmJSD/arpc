import { exitOrThrow } from "./exitOrThrow";

export function error(text: string): never {
    console.error(`\x1b[31m✖  ${text}\x1b[0m`);
    exitOrThrow();
}

export function success(text: string): void {
    console.log(`\x1b[32m✔  ${text}\x1b[0m`);
}
