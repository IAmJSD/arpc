import type { Command } from "commander";
import { statSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import axios from "axios";
import type { BuildData } from "@arpc-packages/client-gen";
import { stringify } from "@arpc-packages/lockfile";
import { RepoFolderStructure, findRepoFolderStructure } from "../utils/findRepoFolderStructure";
import { error, success } from "../utils/console";
import { runShellScript } from "../utils/runShellScript";
import { createGithubAction } from "../utils/createGithubAction";
import { findRpcFolderSync } from "../utils/findRpcFolderSync";
import { handleIgnoreFile } from "../utils/handleIgnoreFile";

async function handleDependency(dependencies: { [key: string]: any }, env: string, name: string, betaUnlessPrefix?: RegExp) {
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

    let currentVersion = sorted[sorted.length - 1];
    if (betaUnlessPrefix && !betaUnlessPrefix.exec(currentVersion)) {
        // Find the nearest beta.
        const highestBetas = new Map<string, number>();
        const keys = Object.keys(versions).filter((v) => v.includes("-"));
        for (const k of keys) {
            const s = k.split("-beta.");
            if (s.length === 1) {
                continue;
            }
            const [version, beta] = s;
            if (Number(beta) > (highestBetas.get(version) || 0)) {
                highestBetas.set(version, Number(beta));
            }
        }

        // Sort the versions.
        const sorted = [...highestBetas.keys()].sort();
        currentVersion = `${sorted[sorted.length - 1]}-beta.${highestBetas.get(sorted[sorted.length - 1])}`;
    }

    // Add the dependency.
    dependencies[name] = "^" + currentVersion;
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

async function makeClientPlaceholder(srcFolder: string) {
    const client = "// This file is a placeholder for the client.\n";
    let hasLib = false;
    let dir = srcFolder;
    try {
        const lib = join(srcFolder, "lib");
        if (statSync(lib).isDirectory()) {
            hasLib = true;
            dir = lib;
        }
    } catch {
        // Just use the root.
    }
    await mkdir(join(dir, "clients"), { recursive: true });
    await writeFile(join(dir, "clients", "rpc.ts"), client);
    return hasLib;
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

function dashify(text: string) {
    return text.toLowerCase().replaceAll(" ", "-");
}

async function cmdAction() {
    // Find the repositories folder structure.
    const folderStructure = findRepoFolderStructure();
    if (!folderStructure) {
        error(
            "Could not find the root of a supported application. Have you initialized the project?",
        );
    }

    // Check if we are already initialized.
    try {
        const rpc = statSync(findRpcFolderSync(folderStructure.framework.folder));
        if (rpc.isDirectory()) {
            error("arpc (or something with a rpc folder) has already been initialized.");
        }
        error(
            "A file has been made with the name rpc in your project folder. Please remove it.",
        );
    } catch {
        // This is good. This means that RPC is not setup.
    }

    // Read package.json.
    let packageJsonStr: string;
    try {
        packageJsonStr = readFileSync(join(folderStructure.framework.folder, "package.json"), "utf8");
    } catch (err) {
        error(`Could not read package.json in the project: ${(err as Error).message}`);
    }
    let packageJson: { [key: string]: any };
    try {
        packageJson = JSON.parse(packageJsonStr);
        if (typeof packageJson !== "object" || Array.isArray(packageJson)) {
            throw new Error("The package.json is not an object");
        }
    } catch (err) {
        error(`Could not parse package.json in the project: ${(err as Error).message}`);
    }

    // Make sure dependencies is a object.
    if (!packageJson.dependencies) {
        packageJson.dependencies = {};
    }
    if (typeof packageJson.dependencies !== "object" || Array.isArray(packageJson.dependencies)) {
        error("Dependencies in package.json is not an object.");
    }
    if (typeof packageJson.devDependencies !== "object" || Array.isArray(packageJson.devDependencies)) {
        if (packageJson.devDependencies) {
            error("devDependencies in package.json is not an object.");
        }
        packageJson.devDependencies = {};
    }

    // Validate scripts.
    if (typeof packageJson.scripts !== "object" || Array.isArray(packageJson.scripts)) {
        error("Scripts in package.json is not an object.");
    }
    const fw = folderStructure.framework.titledName;

    // Log to the console our successes so far without waiting for the network.
    {
        let pacman: string = folderStructure.packageManager;
        if (pacman === "bun") pacman = "Bun";
        const message = (
            `Found your ${pacman} managed ${fw} ${folderStructure.monorepo ? "monorepo" : "project"}.` +
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
            handleDependency(dependencies, "ARPC_SCHEMA_UI_VERSION", "@arpc-packages/schema-ui"),
            handleDependency(dependencies, "MSGPACK_VERSION", "@msgpack/msgpack"),
            handleDependency(dependencies, "VALIBOT_VERSION", "valibot", /^[1-9][0-9]*\./),
            handleDependency(devDependencies, "ARPC_VERSION", "arpc"),
            handleDependency(devDependencies, "CONCURRENTLY_VERSION", "concurrently"),
        ]);
    } catch (err) {
        error(`Failed to add dependencies: ${(err as Error).message}`);
    }

    // Add the arpc scripts.
    packageJson.scripts = packageJson.scripts || {};
    packageJson.scripts.arpc = "arpc";
    const fwDashed = dashify(fw);
    packageJson.scripts[`dev:${fwDashed}`] = packageJson.scripts.dev;
    packageJson.scripts["dev:arpc"] = "arpc watch";
    packageJson.scripts.dev = `concurrently --raw 'npm:dev:${fwDashed}' 'npm:dev:arpc'`;
    packageJson.scripts["lint:arpc"] = "arpc lint";
    packageJson.scripts[`lint:${fwDashed}`] = packageJson.scripts.lint;
    packageJson.scripts.lint = `concurrently --raw 'npm:lint:${fwDashed}' 'npm:lint:arpc'`;

    // Write the package.json.
    writeFileSync(
        join(folderStructure.framework.folder, "package.json"),
        JSON.stringify(packageJson, null, figureOutSpacing(packageJsonStr)),
    );

    // Run <package manager> install.
    runShellScript(folderStructure.packageManager, ["install"], folderStructure.framework.folder);

    // Build the rpc folder.
    let rpcFolder = join(folderStructure.framework.folder, "rpc");
    try {
        const src = join(folderStructure.framework.folder, "src");
        if (statSync(src).isDirectory()) {
            // In which case, the RPC folder should be in here.
            rpcFolder = join(src, "rpc");
        }
    } catch {
        // Just use the root.
    }
    mkdirSync(join(rpcFolder, "routes"), { recursive: true });

    // In parallel, write all the RPC entrypoints.
    const index = stringify({
        hasAuthentication: false,
        hasRatelimiting: false,
        exceptions: {},
        routes: {},
    });
    const [usingLib] = await Promise.all([        
        makeClientPlaceholder(join(rpcFolder, "..")),

        writeFile(
            join(rpcFolder, "index.ts"),
            index,
        ),

        writeFile(
            join(rpcFolder, "build_data.json"),
            JSON.stringify({
                enums: [],
                objects: [],
                builtinExceptions: [],
                customExceptions: [],
                clients: [],
            } satisfies BuildData, undefined, "\t"),
        ),

        writeFile(
            join(rpcFolder, "routes", ".keep"),
            "",
        ),

        folderStructure.framework.createStructure(),

        handleIgnoreFile(
            ".prettierignore",
            folderStructure.gitFolder, folderStructure.framework.folder,
        ),

        handleIgnoreFile(
            ".eslintignore",
            folderStructure.gitFolder, folderStructure.framework.folder,
        ),

        writeGitHubAction(folderStructure),
    ]);
    const clientsFolder = usingLib ? `${folderStructure.framework.importPrefix}lib/clients` : `${folderStructure.framework.importPrefix}clients`;

    // Send the success message.
    console.log(`
\x1b[32m✔  arpc has been successfully installed and mounted into ${fw}!\x1b[0m

You can access the client that your consumers will use within their client-side (or their server-side) JS by importing ${clientsFolder}/rpc. If you need the RPC routes on the ${fw} server (for example in a Server Action), you can use the self export in ${folderStructure.framework.importPrefix}rpc.

To get started, you should make a new API revision. You can do this by running \x1b[36marpc versions bump\x1b[0m. If you wish to setup ratelimiting, you can run \x1b[36marpc scaffold ratelimiting\x1b[0m, or authentication with \x1b[36marpc scaffold authentication\x1b[0m.

To view your API's documentation, you can visit \x1b[36m/api/rpc/docs\x1b[0m.
`);
}

export function init(cmd: Command) {
    cmd
        .description("Initialize a new arpc service.")
        .action(cmdAction);
}
