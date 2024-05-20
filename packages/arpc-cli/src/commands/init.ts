import type { Command } from "commander";
import { statSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, sep } from "path";
import axios from "axios";
import { stringify } from "@arpc/lockfile";
import { findRepoFolderStructure } from "../utils/findRepoFolderStructure";
import { error, success } from "../utils/console";
import { runShellScript } from "../utils/runShellScript";

async function handleDependency(dependencies: { [key: string]: any }, name: string) {
    if (dependencies[name]) {
        // Dependency already exists.
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

async function writeNextEntrypoints(nextFolder: string, isAppRouter: boolean) {
    // Make sure the app/page router folder exists. We will need the api
    // folder in both cases, so make sure it exists.
    await mkdir(
        join(nextFolder, isAppRouter ? "app" : "pages", "api"),
        { recursive: true },
    );

    if (isAppRouter) {
        await Promise.all([
            // Write /api/rpc.
            writeFile(
                join(nextFolder, "app", "api", "rpc.ts"),
                `import { httpHandler } from "@/rpc";

export const GET = httpHandler;

export const POST = httpHandler;
`,
            ),

            // Write the files for the /arpc route.
            mkdir(
                join(nextFolder, "app", "(arpc)", "arpc"),
                { recursive: true },
            ).then(() => {
                // Write page.tsx.
                const page = writeFile(
                    join(nextFolder, "app", "(arpc)", "arpc", "page.tsx"),
                    `import { generateSchema } from "@/rpc";
import { SchemaViewer } from "@arpc/schema-viewer";

export default async function ARPCDocumentation() {
    const schema = await generateSchema();

    return <SchemaViewer schema={schema} />;
}
`);

                // Write layout.tsx.
                const layout = writeFile(
                    join(nextFolder, "app", "(arpc)", "arpc", "layout.tsx"),
                    `import type { Metadata } from "next";

// Load in the styles for the arpc schema viewer.
import "@arpc/schema-viewer/styles.css";

export const runtime = "nodejs";

export const metadata: Metadata = {
    title: "API Documentation",
    description: "The documentation for the API.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body class="dark:bg-gray-800 dark:text-white">
                {children}
            </body>
        </html>
    );
}
`);

                // Wait for both to finish.
                return Promise.all([page, layout]);
            }),
        ]);
    } else {
        await Promise.all([
            // Write /api/rpc.
            writeFile(
                join(nextFolder, "pages", "api", "rpc.ts"),
                `import { httpHandler } from "@/rpc";
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_METHODS = ["GET", "POST"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!ALLOWED_METHODS.includes(req.method)) {
        res.setHeader("Allow", "GET, POST");
        res.status(405).end();
        return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
            headers.set(
                key, typeof value === "string" ? value : value[0],
            );
        }
    }

    const webStandardResp = await httpHandler(new Request(req.url!, {
        body: req.body, headers,
    }));
    for (const [key, value] of Object.entries(webStandardResp.headers)) {
        res.setHeader(key, value);
    }
    res.status(webStandardResp.status).send(webStandardResp.body);
}
`),

            // Write /arpc.
            writeFile(
                join(nextFolder, "pages", "arpc.tsx"),
                `import { generateSchema } from "@/rpc";
import { SchemaViewer } from "@arpc/schema-viewer";

type Props = {
    schema: any;
};

export default SchemaViewer;

export async function getServerSideProps() {
    const schema = await generateSchema();

    return { props: { schema } };
}
`),
        ]);
    }
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

function addToIgnoreFile(ignore: string, rel: string) {
    if (!ignore.endsWith("\n")) {
        ignore += "\n";
    }
    ignore += rel + "\n";
    return ignore;
}

async function handlePrettierIgnore(gitFolder: string | null, nextFolder: string) {
    // Check if the .prettierignore file exists in the Git folder.
    if (gitFolder) {
        let ignore: string | null = null;
        try {
            ignore = await readFile(join(gitFolder, ".prettierignore"), "utf8");
        } catch {
            // If we error here, continue on.
        }

        if (ignore) {
            const rel = getRpcIndexRelPath(gitFolder, nextFolder);
            if (ignore.includes(rel)) {
                // The ignore file already contains the path.
                return;
            }
            addToIgnoreFile(ignore, rel);
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
    const rel = "rpc/index.ts";
    if (ignore.includes(rel)) {
        // The ignore file already contains the path.
        return;
    }
    ignore = addToIgnoreFile(ignore, rel);
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
            if (ignore.includes(rel)) {
                // The ignore file already contains the path.
                return;
            }
            addToIgnoreFile(ignore, rel);
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
    const rel = "rpc/index.ts";
    if (ignore.includes(rel)) {
        // The ignore file already contains the path.
        return;
    }
    ignore = addToIgnoreFile(ignore, rel);
    await writeFile(join(nextFolder, ".eslintignore"), ignore);
}

async function makeClientPlaceholder(nextFolder: string) {
    const client = "// This file is a placeholder for the client.\n";
    await mkdir(join(nextFolder, "clients"), { recursive: true });
    await writeFile(join(nextFolder, "clients", "rpc.ts"), client);
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

    // Check if typescript is in devDependencies and if it is then move it.
    if (typeof packageJson.devDependencies === "object" && !Array.isArray(packageJson.devDependencies)) {
        const t = packageJson.devDependencies.typescript;
        if (t) {
            packageJson.dependencies.typescript = t;
            delete packageJson.devDependencies.typescript;
        }
    }

    // Find if this is app router.
    let isAppRouter = false;
    try {
        const s = statSync(join(folderStructure.nextFolder, "app"));
        if (!s.isDirectory()) throw new Error();
        isAppRouter = true;
    } catch {
        // Make sure that pages either doesn't exist or is a directory.
        try {
            const s = statSync(join(folderStructure.nextFolder, "pages"));
            if (s.isDirectory()) throw new Error();

            // This error won't hit the catch.
            error(
                "both app and pages are files. Please remove one of them to continue.",
            );
        } catch {
            // If one of these fails, we are okay.
        }
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
    try {
        await Promise.all([
            handleDependency(dependencies, "@arpc/core"),
            handleDependency(dependencies, "@arpc/schema-viewer"),
            handleDependency(dependencies, "@msgpack/msgpack"),
            handleDependency(dependencies, "zod"),
            handleDependency(dependencies, "typescript"),
        ]);
    } catch (err) {
        error(`Failed to add dependencies: ${(err as Error).message}`);
    }

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
            join(folderStructure.nextFolder, "rpc", "routes", ".keep"),
            "",
        ),

        writeNextEntrypoints(folderStructure.nextFolder, isAppRouter),

        handlePrettierIgnore(
            folderStructure.gitFolder, folderStructure.nextFolder,
        ),

        handleEslintIgnore(
            folderStructure.gitFolder, folderStructure.nextFolder,
        ),

        makeClientPlaceholder(folderStructure.nextFolder),
    ]);

    // Send the success message.
    console.log(`
\x1b[32m✔  arpc has been successfully installed and mounted into Next!\x1b[0m

You can access the client that your consumers will use within their client-side (or their server-side) JS by importing @/clients/rpc. If you need the RPC routes on the Next server (for example in a Server Action), you can use the self export in @/rpc.

To get started, you should make a new API revision. You can do this by running \x1b[36marpc versions create\x1b[0m. If you wish to setup ratelimiting, you can run \x1b[36marpc scaffold ratelimiting\x1b[0m, or authentication with \x1b[36marpc scaffold authentication\x1b[0m.
`);
}

export function init(cmd: Command) {
    cmd
        .description("Initialize a new arpc service.")
        .action(cmdAction);
}
