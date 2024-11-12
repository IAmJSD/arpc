import { join } from "path";
import { readFileSync } from "fs";
import type { Framework } from ".";

async function writeEntrypoints(solidFolder: string) {

}

const APP_CONFIG_REGEX = /^app\.config\.[mc]?[tj]sx?$/;

export function checkIfSolidStart(folder: string, files: string[]) {
    for (const f of files) {
        if (APP_CONFIG_REGEX.test(f)) {
            const joined = join(folder, f);
            try {
                const data = readFileSync(joined, { encoding: "utf8" });
                if (data.includes("solidjs")) {
                    // Probably Solid.
                    return {
                        titledName: "SolidStart",
                        folder,
                        createStructure: () => writeEntrypoints(folder),
                    } satisfies Framework;
                }
            } catch {}
        }
    }
    return null;
}
