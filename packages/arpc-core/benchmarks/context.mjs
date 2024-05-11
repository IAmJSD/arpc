import { Bench } from "tinybench";
import { AsyncLocalStorage } from "node:async_hooks";

const bench = new Bench({ time: 100 });

const asyncStorage = new AsyncLocalStorage();
const m = new Map();
let lastWorker = 0;

async function pollute(fn) {
    const w = lastWorker++;
    const name = `$ARPCWorker${w}`;
    m.set(w, 1);
    const obj = {
        async [name]() {
            try {
                return await fn();
            } finally {
                m.delete(w);
            }
        },
    };
    return obj[name]();
}

const WORKER_STACK_REGEX = /\$ARPCWorker([0-9]+)/gm;

function getValue() {
    let stack;
    try {
        // Throw an error so the stack is captured.
        throw new Error();
    } catch (e) {
        // Get the current stack.
        stack = e.stack;
        if (stack === undefined) return null;
    }

    // Get the worker number.
    const match = WORKER_STACK_REGEX.exec(stack);
    if (match) {
        const id = parseInt(match[1]);
        return m.get(id) || null;
    }
    return null;
}

bench.
    add("async local storage", async () => {
        async function run() {
            asyncStorage.getStore();
        }
        await asyncStorage.run(1, run);
    }).
    add("stack pollution", async () => {
        async function hn() {
            getValue();
        }
        await pollute(hn);
    });

await bench.warmup();
await bench.run();

console.log("Context fetching methods:");
console.table(
    bench.table(),
);
