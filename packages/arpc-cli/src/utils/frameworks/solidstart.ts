import { join } from "path";
import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import type { Framework } from ".";

async function writeEntrypoints(solidFolder: string) {
    const routesDir = join(solidFolder, "src", "routes");
    const apiDir = join(routesDir, "api");
    await mkdir(apiDir, { recursive: true }).then(() => Promise.all([
        // Write /api/rpc
        writeFile(
            join(apiDir, "rpc.ts"),
            `import type { APIEvent } from "@solidjs/start/server";
import { httpHandler } from "@/rpc";

function solidWrap({ request }: APIEvent) {
    return httpHandler(request);
}

export const GET = solidWrap;

export const POST = solidWrap;
`,
        ),
    ]))
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
