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
    const apiDir = join(srcFolder, "app", "api", "rpc");
    await mkdir(apiDir, { recursive: true }).then(() => {
        return writeFile(
            join(apiDir, "route.ts"),
            `import { httpHandler } from "@/rpc";

export const GET = httpHandler;

export const POST = httpHandler;
`,
        );
    });

    const pagesDir = join(srcFolder, "pages");
    await mkdir(pagesDir, { recursive: true }).then(() => {
        return writeFile(
            join(pagesDir, "arpc.tsx"),
            `import schema from "@/rpc/build_data.json";
import { SchemaViewer } from "@arpc-packages/schema-viewer";

// Defines the title that is used for the page.
const title: string = "API Documentation";

// Defines the description that is used for the page.
const description: string = "This is the arpc API documentation for this service.";

// Load in the CSS for the viewer.
import "@arpc-packages/schema-viewer/styles.css";

// Export the schema viewer and template used for the main page.
export default SchemaViewer;

// Load in the static props so this statically builds. Do not touch this, it isn't type checked.
export async function getStaticProps() {
    return { props: { schema, title, description } };
}
`);
    });
}

const NEXT_CONFIG_REGEX = /^next\.config\.[mc]?[tj]sx?$/;

export function checkIfNext(folder: string, files: string[]) {
    for (const f of files) {
        if (NEXT_CONFIG_REGEX.test(f)) {
            return {
                titledName: "Next", folder,
                createStructure: () => writeEntrypoints(folder),
            } satisfies Framework;
        }
    }
    return null;
}
