import { join } from "path";
import { readdirSync } from "fs";
import { checkIfNext } from "./next";
import { checkIfSolidStart } from "./solidstart";
import { checkIfSvelteKit } from "./sveltekit";

export type Framework = {
    importPrefix: string;
    titledName: string;
    folder: string;
    createStructure: () => Promise<void>;
};

const frameworkCheckers: ((folder: string, files: string[]) => Framework | null)[] = [
    checkIfNext, checkIfSolidStart, checkIfSvelteKit,
];

export function findFramework() {
    let folder = process.cwd();

    for (;;) {
        try {
            // See if this is the framework root.
            const files = readdirSync(folder);
            for (const checker of frameworkCheckers) {
                const v = checker(folder, files);
                if (v) return v;
            }

            // Go up a folder.
            folder = join(folder, "..");
            if (folder === "/") {
                // We are at the root. Return null.
                return null;
            }
        } catch {
            // Too far. Return null.
            return null;
        }
    }
}
