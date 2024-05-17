export function error(text: string): never {
    console.error(`\x1b[31m✖  ${text}\x1b[0m`);
    process.exit(1);
}

export function success(text: string): void {
    console.log(`\x1b[32m✔  ${text}\x1b[0m`);
}
