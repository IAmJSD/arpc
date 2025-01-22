import { join } from "path";
import { readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import type { Framework } from ".";

async function writeEntrypoints(solidFolder: string) {
    const routesDir = join(solidFolder, "src", "routes");
    const apiRpcDir = join(routesDir, "api", "rpc");
    await mkdir(apiRpcDir, { recursive: true }).then(() => Promise.all([
        // Write /api/rpc
        writeFile(
            join(apiRpcDir, "..", "rpc.ts"),
            `import type { APIEvent } from "@solidjs/start/server";
import { httpHandler } from "~/rpc";

function solidWrap({ request }: APIEvent) {
    return httpHandler(request);
}

export const GET = solidWrap;

export const POST = solidWrap;
`,
        ),

        // Write /api/rpc/docs
        writeFile(
            join(apiRpcDir, "docs.ts"),
            `import schema from "~/rpc/build_data.json";
import { render } from "@arpc-packages/schema-ui";
import type { BuildData } from "@arpc-packages/client-gen";

// Defines the title that is used for the page.
const title: string = "API Documentation";

// Defines the description that is used for the page.
const description: string = "This is the arpc API documentation for this service.";

// Export the schema viewer.
export function GET() {
    const html = render(title, description, schema as BuildData);
    return new Response(html, { headers: { "Content-Type": "text/html" } });
}
`,
        ),
    ]));
}

const APP_CONFIG_REGEX = /^app\.config\.[mc]?[tj]sx?$/;

export function checkIfSolidStart(folder: string, files: string[]) {
    for (const f of files) {
        if (APP_CONFIG_REGEX.test(f)) {
            const joined = join(folder, f);
            try {
                const data = readFileSync(joined, "utf-8");
                if (data.includes("solidjs")) {
                    // Probably Solid.
                    return {
                        importPrefix: "~/",
                        titledName: "SolidStart", folder,
                        createStructure: () => writeEntrypoints(folder),
                    } satisfies Framework;
                }
            } catch {}
        }
    }
    return null;
}
