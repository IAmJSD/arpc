import { workerContext } from "./workerContext";

// Wraps the function in a proxy to dedupe the result of function calls within each network call.
export function dedupe<
    T extends (...args: any[]) => Promise<any>,
>(fn: T): T {
    return new Proxy(fn, {
        apply(target, thisArg, args) {
            const ctx = workerContext();
            if (ctx) {
                // Get the function cache from the context.
                let a: [any[], any][] = ctx.get(fn);
                if (!a) {
                    a = [];
                    ctx.set(fn, a);
                }

                // The likelihood of a deduped (and therefore expensive) function being called
                // hundreds of times in a single worker is low, so we can afford to be a bit
                // inefficient here.
                for (const [args_, result] of a) {
                    if (args_.length !== args.length) continue;
                    let i = 0;
                    for (; i < args.length; i++) {
                        if (args_[i] !== args[i]) break;
                    }
                    if (i === args.length) return result;
                }

                // Call the function and store the result.
                const result = target.apply(thisArg, args);
                a.push([args, result]);
                return result;
            }

            // No worker context, just call the function.
            return target.apply(thisArg, args);
        },
    });
}

// Gets the arguments of a function.
type Args<T> = T extends (...args: infer A) => any ? A : never;

// Defines if the function has already been called with the arguments specified.
export function alreadyDeduped<
    T extends (...args: any[]) => Promise<any>,
>(fn: T, ...args: Args<T>) {
    const ctx = workerContext();
    if (!ctx) return false;

    // Get the function cache from the context.
    let a: [any[], any][] = ctx.get(fn);
    if (!a) {
        return false;
    }

    // Check if the function has already been called with the arguments.
    for (const [args_] of a) {
        if (args_.length !== args.length) continue;
        let i = 0;
        for (; i < args.length; i++) {
            if (args_[i] !== args[i]) break;
        }
        if (i === args.length) return true;
    }

    return false;
}
