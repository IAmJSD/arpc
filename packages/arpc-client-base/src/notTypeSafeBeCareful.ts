// @ts-nocheck

export function doInternalTagging<
    TagName extends string,
    UntaggedObj extends Record<string, any>,
>(
    tagName: TagName, obj: UntaggedObj,
): UntaggedObj & { " $ARPC_INTERNAL_type": TagName } {
    if (!globalThis.__ARPC_INTERNAL_TAG__) {
        globalThis.__ARPC_INTERNAL_TAG__ = Symbol(" $ARPC_INTERNAL_type");
    }
    obj[globalThis.__ARPC_INTERNAL_TAG__] = tagName;
    return obj;
}

export function getInternalTag(obj: any): string | undefined {
    if (!globalThis.__ARPC_INTERNAL_TAG__) {
        return undefined;
    }
    if (typeof obj !== "object" || obj === null) {
        return undefined;
    }
    return obj[globalThis.__ARPC_INTERNAL_TAG__];
}
