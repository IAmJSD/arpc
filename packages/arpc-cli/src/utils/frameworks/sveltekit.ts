import type { Framework } from ".";
import { join } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";

const jsFunction = `/**
 * @param {import('@sveltejs/kit').Config} config
 * @returns {import('@sveltejs/kit').Config}
 */
function withArpc(config) {
    config.kit ||= {};
    config.kit.alias ||= {};
    config.kit.alias["~rpc"] = "src/rpc";
    return config;
}`;

const tsFunction = `function withArpc(config: Config) {
    config.kit ||= {};
    config.kit.alias ||= {};
    config.kit.alias["~rpc"] = "src/rpc";
    return config;
}`;

function updateConfig(configFile: string, isTs: boolean) {
    const configSplit = configFile.split("\n");
    const exportDefault = configSplit.findIndex((line) => line.startsWith("export default"));
    if (exportDefault === -1) throw new Error("No export default found in config file");
    const line = configSplit[exportDefault];
    if (line.includes(";")) {
        const exportDefaultLine = line.split(";")[0].replace("export default ", "");
        configSplit[exportDefault] = `${isTs ? tsFunction : jsFunction}

export default withArpc(${exportDefaultLine});`;
    } else {
        configSplit[exportDefault] = line.replace("export default ", "const svelteConfig = ");
        configSplit.push(`${isTs ? tsFunction : jsFunction}

export default withArpc(svelteConfig);`);
    }
    let linesJoined = configSplit.join("\n");
    if (!linesJoined.endsWith("\n")) linesJoined += "\n";
    return linesJoined;
}

async function writeEntrypoints(folder: string, filename: string) {
    const apiRpcDocsDir = join(folder, "src", "routes", "api", "rpc", "docs");
    await mkdir(apiRpcDocsDir, { recursive: true }).then(() => Promise.all([
        writeFile(join(apiRpcDocsDir, "+server.ts"), `import schema from "~rpc/build_data.json";
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
`),

    writeFile(join(apiRpcDocsDir, "..", "+server.ts"), `import { httpHandler } from "~rpc";

function svelteWrap({ request }: { request: Request }) {
    return httpHandler(request);
}

export const GET = svelteWrap;

export const POST = svelteWrap;
`),
    ]));

    const suffix = filename.split(".").pop()!;
    const isTs = suffix.endsWith("ts") || suffix.endsWith("tsx");
    const configFile = updateConfig(await readFile(join(folder, filename), "utf-8"), isTs);
    await writeFile(join(folder, filename), configFile);
}

const SVELTE_CONFIG_REGEX = /^svelte\.config\.[mc]?[tj]sx?$/;

export function checkIfSvelteKit(folder: string, files: string[]) {
    for (const f of files) {
        if (SVELTE_CONFIG_REGEX.test(f)) {
            return {
                importPrefix: "$", titledName: "SvelteKit", folder,
                createStructure: () => writeEntrypoints(folder, f),
            } satisfies Framework;
        }
    }
    return null;
}
