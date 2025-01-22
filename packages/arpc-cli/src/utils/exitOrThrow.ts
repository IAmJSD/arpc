let throwWith: any = undefined;

export function setThrowWith(res: any) {
    throwWith = res;
}

export function exitOrThrow(): never {
    if (throwWith !== undefined) {
        throw throwWith;
    }
    process.exit(1);
}
