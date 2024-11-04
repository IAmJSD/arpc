import type { Command } from "commander";
import { statSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, sep } from "path";
import axios from "axios";
import type { BuildData } from "@arpc-packages/client-gen";
import { stringify } from "@arpc-packages/lockfile";
import { RepoFolderStructure, findRepoFolderStructure } from "../utils/findRepoFolderStructure";
import { error, success } from "../utils/console";
import { runShellScript } from "../utils/runShellScript";
import { createGithubAction } from "../utils/createGithubAction";

async function handleDependency(dependencies: { [key: string]: any }, env: string, name: string) {
    if (dependencies[name]) {
        // Dependency already exists.
        return;
    }

    // Handle if it is set in a environment variable.
    if (process.env[env]) {
        dependencies[name] = process.env[env];
        return;
    }

    // Get the latest version from the registry.
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    const response = await axios.get(url);
    if (response.status !== 200) {
        throw new Error(`Failed to get the latest version of ${name}`);
    }
    const versions: { [key: string]: any } = response.data.versions;
    const sorted = Object.keys(versions).sort().filter((v) => !v.includes("-"));

    // Add the dependency.
    dependencies[name] = "^" + sorted[sorted.length - 1];
}

function figureOutSpacing(str: string): string {
    let spacing = "";

    // Iterate through the string.
    for (const c of str) {
        // Figure out if it is a space or a tab.
        if (c === " " || c === "\t") {
            spacing += c;
        } else {
            if (spacing.length > 0) {
                return spacing;
            }
        }
    }
    return "    ";
}

async function writeNextEntrypoints(nextFolder: string) {
    const apiDir = join(nextFolder, "app", "api", "rpc");
    await mkdir(apiDir, { recursive: true }).then(() => {
        return writeFile(
            join(apiDir, "route.ts"),
            `import { httpHandler } from "@/rpc";

export const GET = httpHandler;

export const POST = httpHandler;
`,
        );
    });

    const pagesDir = join(nextFolder, "pages");
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

function getRpcIndexRelPath(basePath: string, childPath: string) {
    let relative = childPath.slice(basePath.length);
    if (relative.startsWith(sep)) {
        relative = relative.slice(1);
    }
    relative = relative.replace(new RegExp("\\" + sep, "g"), "/");
    if (!relative.endsWith("/")) {
        relative += "/";
    }
    relative += "rpc/index.ts";
    return relative;
}

function addUniqueToIgnoreFile(ignore: string, rel: string) {
    const lines = ignore.trim().split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === rel) {
            return ignore;
        }
    }
    lines.push(rel);
    return lines.join("\n") + "\n";
}

async function handlePrettierIgnore(gitFolder: string | null, nextFolder: string) {
    // Check if the .prettierignore file exists in the Git folder.
    if (gitFolder) {
        let ignore = "";
        try {
            ignore = await readFile(join(gitFolder, ".prettierignore"), "utf8");
        } catch {
            // If we error here, continue on.
        }

        if (ignore) {
            const rel = getRpcIndexRelPath(gitFolder, nextFolder);
            ignore = addUniqueToIgnoreFile(ignore, rel);
            await writeFile(join(gitFolder, ".prettierignore"), ignore);
            return;
        }
    }

    // Try to get the .prettierignore from the Next folder. If we can't, don't worry,
    // we will just create a new one.
    let ignore = "";
    try {
        ignore = await readFile(join(nextFolder, ".prettierignore"), "utf8");
    } catch {
        // If we error here, continue on.
    }
    const rels = ["rpc/index.ts", "rpc/build_data.json"];
    for (const rel of rels) ignore = addUniqueToIgnoreFile(ignore, rel);
    await writeFile(join(nextFolder, ".prettierignore"), ignore);
}

async function handleEslintIgnore(gitFolder: string | null, nextFolder: string) {
    // Check if the .eslintignore file exists in the Git folder.
    if (gitFolder) {
        let ignore: string | null = null;
        try {
            ignore = await readFile(join(gitFolder, ".eslintignore"), "utf8");
        } catch {
            // If we error here, continue on.
        }

        if (ignore) {
            const rel = getRpcIndexRelPath(gitFolder, nextFolder);
            ignore = addUniqueToIgnoreFile(ignore, rel);
            await writeFile(join(gitFolder, ".eslintignore"), ignore);
            return;
        }
    }

    // Try to get the .eslintignore from the Next folder. If we can't, don't worry,
    // we will just create a new one.
    let ignore = "";
    try {
        ignore = await readFile(join(nextFolder, ".eslintignore"), "utf8");
    } catch {
        // If we error here, continue on.
    }
    const rels = ["rpc/index.ts", "rpc/build_data.json"];
    for (const rel of rels) ignore = addUniqueToIgnoreFile(ignore, rel);
    await writeFile(join(nextFolder, ".eslintignore"), ignore);
}

async function makeClientPlaceholder(nextFolder: string) {
    const client = "// This file is a placeholder for the client.\n";
    await mkdir(join(nextFolder, "clients"), { recursive: true });
    await writeFile(join(nextFolder, "clients", "rpc.ts"), client);
}

async function writeGitHubAction(folderStructure: RepoFolderStructure) {
    if (!folderStructure.gitFolder) {
        // We can't write a GitHub action if we don't have a Git folder.
        return;
    }
    const action = await createGithubAction(folderStructure);
    const workflowFolder = join(folderStructure.gitFolder, ".github", "workflows");
    await mkdir(workflowFolder, { recursive: true });
    await writeFile(join(workflowFolder, "arpc_lint.yml"), action);
}

async function cmdAction() {
    // Find the repositories folder structure.
    const folderStructure = findRepoFolderStructure();
    if (!folderStructure) {
        error(
            "Could not find the root of the Next application. Have you initialized the project?",
        );
    }

    // Check if we are already initialized.
    try {
        const rpc = statSync(join(folderStructure.nextFolder, "rpc"));
        if (rpc.isDirectory()) {
            error("arpc (or something with a rpc folder) has already been initialized.");
        }
        error(
            "A file has been made with the name rpc in your Next project folder. Please remove it.",
        );
    } catch {
        // This is good. This means that RPC is not setup.
    }

    // Read package.json.
    let packageJsonStr: string;
    try {
        packageJsonStr = readFileSync(join(folderStructure.nextFolder, "package.json"), "utf8");
    } catch (err) {
        error(`Could not read package.json in the Next project: ${(err as Error).message}`);
    }
    let packageJson: { [key: string]: any };
    try {
        packageJson = JSON.parse(packageJsonStr);
        if (typeof packageJson !== "object" || Array.isArray(packageJson)) {
            throw new Error("The package.json is not an object");
        }
    } catch (err) {
        error(`Could not parse package.json in the Next project: ${(err as Error).message}`);
    }

    // Make sure dependencies is a object.
    if (!packageJson.dependencies) {
        packageJson.dependencies = {};
    }
    if (typeof packageJson.dependencies !== "object" || Array.isArray(packageJson.dependencies)) {
        error("Dependencies in package.json is not an object.");
    }
    if (typeof packageJson.devDependencies !== "object" || Array.isArray(packageJson.devDependencies)) {
        error("devDependencies in package.json is not an object.");
    }

    // Validate scripts.
    if (typeof packageJson.scripts !== "object" || Array.isArray(packageJson.scripts)) {
        error("Scripts in package.json is not an object.");
    }

    // Log to the console our successes so far without waiting for the network.
    {
        let pacman: string = folderStructure.packageManager;
        if (pacman === "bun") pacman = "Bun";
        const message = (
            `Found your ${pacman} managed Next ${folderStructure.monorepo ? "monorepo" : "project"}.` +
            " Setting up dependencies and project structure now!"
        );
        success(message);
    }

    // Write to the dependencies. This uses a Promise because it makes network requests.
    const dependencies: { [key: string]: any } = packageJson.dependencies;
    const devDependencies: { [key: string]: any } = packageJson.devDependencies;
    try {
        await Promise.all([
            handleDependency(dependencies, "ARPC_CORE_VERSION", "@arpc-packages/core"),
            handleDependency(dependencies, "ARPC_SCHEMA_GEN_VERSION", "@arpc-packages/schema-gen"),
            handleDependency(dependencies, "ARPC_SCHEMA_VIEWER_VERSION", "@arpc-packages/schema-viewer"),
            handleDependency(dependencies, "MSGPACK_VERSION", "@msgpack/msgpack"),
            handleDependency(dependencies, "ZOD_VERSION", "zod"),
            handleDependency(devDependencies, "ARPC_VERSION", "arpc"),
            handleDependency(devDependencies, "CONCURRENTLY_VERSION", "concurrently"),
        ]);
    } catch (err) {
        error(`Failed to add dependencies: ${(err as Error).message}`);
    }

    // Add the arpc scripts.
    packageJson.scripts = packageJson.scripts || {};
    packageJson.scripts.arpc = "arpc";
    packageJson.scripts["dev:next"] = packageJson.scripts.dev;
    packageJson.scripts["dev:arpc"] = "arpc watch";
    packageJson.scripts.dev = "concurrently --raw 'npm:dev:next' 'npm:dev:arpc'";
    packageJson.scripts["lint:arpc"] = "arpc lint";
    packageJson.scripts["lint:next"] = packageJson.scripts.lint;
    packageJson.scripts.lint = "concurrently --raw 'npm:lint:next' 'npm:lint:arpc'";

    // Write the package.json.
    writeFileSync(
        join(folderStructure.nextFolder, "package.json"),
        JSON.stringify(packageJson, null, figureOutSpacing(packageJsonStr)),
    );

    // Run <package manager> install.
    runShellScript(folderStructure.packageManager, ["install"], folderStructure.nextFolder);

    // Build the rpc folder.
    mkdirSync(join(folderStructure.nextFolder, "rpc", "routes"), { recursive: true });

    // In parallel, write all the RPC entrypoints.
    const index = stringify({
        hasAuthentication: false,
        hasRatelimiting: false,
        exceptions: {},
        routes: {},
    });
    await Promise.all([
        writeFile(
            join(folderStructure.nextFolder, "rpc", "index.ts"),
            index,
        ),

        writeFile(
            join(folderStructure.nextFolder, "rpc", "build_data.json"),
            JSON.stringify({
                enums: [],
                objects: [],
                builtinExceptions: [],
                customExceptions: [],
                clients: [],
            } satisfies BuildData, undefined, "\t"),
        ),

        writeFile(
            join(folderStructure.nextFolder, "rpc", "routes", ".keep"),
            "",
        ),

        writeNextEntrypoints(folderStructure.nextFolder),

        handlePrettierIgnore(
            folderStructure.gitFolder, folderStructure.nextFolder,
        ),

        handleEslintIgnore(
            folderStructure.gitFolder, folderStructure.nextFolder,
        ),

        makeClientPlaceholder(folderStructure.nextFolder),

        writeGitHubAction(folderStructure),
    ]);

    // Send the success message.
    console.log(`
\x1b[32m✔  arpc has been successfully installed and mounted into Next!\x1b[0m

You can access the client that your consumers will use within their client-side (or their server-side) JS by importing @/clients/rpc. If you need the RPC routes on the Next server (for example in a Server Action), you can use the self export in @/rpc.

To get started, you should make a new API revision. You can do this by running \x1b[36marpc versions bump\x1b[0m. If you wish to setup ratelimiting, you can run \x1b[36marpc scaffold ratelimiting\x1b[0m, or authentication with \x1b[36marpc scaffold authentication\x1b[0m.
`);
}

export function init(cmd: Command) {
    cmd
        .description("Initialize a new arpc service.")
        .action(cmdAction);
}
