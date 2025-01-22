import { join } from "path";
import { mkdir, writeFile, stat } from "fs/promises";
import type { Framework } from ".";

const arpcGetHandler = `import { httpHandler } from "@/rpc";

export default defineEventHandler((event) => {
    const headersRemapping: [string, string][] = [];
    for (const [key, value] of Object.entries(event.node.req.headers)) {
        if (Array.isArray(value)) {
            for (const v of value) {
                headersRemapping.push([key, v]);
            }
        } else if (value) {
            headersRemapping.push([key, value]);
        }
    }
    const req = new Request(event.node.req.url!, {
        method: event.node.req.method!,
        headers: new Headers(headersRemapping),
    });

    return httpHandler(req);
});
`;

const arpcPostHandler = `import { httpHandler } from "@/rpc";

export default defineEventHandler((event) => {
    const headersRemapping: [string, string][] = [];
    for (const [key, value] of Object.entries(event.node.req.headers)) {
        if (Array.isArray(value)) {
            for (const v of value) {
                headersRemapping.push([key, v]);
            }
        } else if (value) {
            headersRemapping.push([key, value]);
        }
    }
    const req = new Request(event.node.req.url!, {
        body: event._requestBody,
        method: event.node.req.method!,
        headers: new Headers(headersRemapping),
    });

    return httpHandler(req);
});
`;

const arpcDocsHandler = `import schema from "@/rpc/build_data.json";
import { render } from "@arpc-packages/schema-ui";
import type { BuildData } from "@arpc-packages/client-gen";

// Defines the title that is used for the page.
const title: string = "API Documentation";

// Defines the description that is used for the page.
const description: string = "This is the arpc API documentation for this service.";

// Export the schema viewer.
export default defineEventHandler(() => {
    const html = render(title, description, schema as BuildData);
    return new Response(html, { headers: { "Content-Type": "text/html" } });
});
`;

async function writeEntrypoints(nuxtFolder: string) {
    const apiRpcDir = join(nuxtFolder, "server", "api", "rpc");
    await mkdir(apiRpcDir, { recursive: true }).then(() => {
        return Promise.all([
            writeFile(join(apiRpcDir, "docs.get.ts"), arpcDocsHandler),
            writeFile(join(apiRpcDir, "..", "arpc.get.ts"), arpcGetHandler),
            writeFile(join(apiRpcDir, "..", "arpc.post.ts"), arpcPostHandler),
        ]);
    });
}

const NUXT_CONFIG_REGEX = /^nuxt\.config\.[mc]?[tj]sx?$/;

export function checkIfNuxt(folder: string, files: string[]) {
    for (const f of files) {
        if (NUXT_CONFIG_REGEX.test(f)) {
            return {
                importPrefix: "@/", titledName: "Nuxt", folder,
                createStructure: () => writeEntrypoints(folder),
            } satisfies Framework;
        }
    }
    return null;
}
