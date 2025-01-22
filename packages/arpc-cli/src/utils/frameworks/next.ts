import { join } from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import type { Framework } from ".";

async function writeEntrypoints(nextFolder: string) {
    // If "src" exists and is a folder, that is our source folder.
    let srcFolder = nextFolder;
    try {
        const withSrc = join(nextFolder, "src");
        if ((await stat(withSrc)).isDirectory()) {
            srcFolder = withSrc;
        }
    } catch {
        // nvm
    }

    // Write to the source folder.
    const apiDir = join(srcFolder, "app", "api", "rpc", "docs");
    await mkdir(apiDir, { recursive: true }).then(() => {
        return writeFile(
            join(apiDir, "..", "route.ts"),
            `import { httpHandler } from "@/rpc";

export const GET = httpHandler;

export const POST = httpHandler;
`,
        );
    });

    await writeFile(
        join(apiDir, "route.ts"),
        `import schema from "@/rpc/build_data.json";
import { render } from "@arpc-packages/schema-ui";
import type { BuildData } from "@arpc-packages/client-gen";

// Defines the title that is used for the page.
const title: string = "API Documentation";

// Defines the description that is used for the page.
const description: string = "This is the arpc API documentation for this service.";

// Tell Next this is a static page.
export const dynamic = "force-static";

// Export the schema viewer.
export function GET() {
    const html = render(title, description, schema as BuildData);
    return new Response(html, { headers: { "Content-Type": "text/html" } });
}
`);
}

const NEXT_CONFIG_REGEX = /^next\.config\.[mc]?[tj]sx?$/;

export function checkIfNext(folder: string, files: string[]) {
    for (const f of files) {
        if (NEXT_CONFIG_REGEX.test(f)) {
            return {
                importPrefix: "@/", titledName: "Next", folder,
                createStructure: () => writeEntrypoints(folder),
            } satisfies Framework;
        }
    }
    return null;
}
