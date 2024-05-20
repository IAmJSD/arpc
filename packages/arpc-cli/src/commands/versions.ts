import type { Command } from "commander";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { readdir, rename, stat, mkdir } from "fs/promises";
import { join, sep } from "path";
import { stringify } from "@arpc/lockfile";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { API_REVISION_REGEX, sortVersions } from "../utils/sortVersions";
import { error, success } from "../utils/console";
import { generateClient } from "../utils/generateClient";
import { RPCVersionWithCache, versionParser } from "../utils/versionParser";
import { argumentWithParser } from "../utils/argumentWithParser";

async function bump() {
    const { lockfile, repoFolderStructure, rpcPath } = requiresRpcInit();

    const versions = sortVersions(Object.keys(lockfile.routes));
    const latestVersion = versions[versions.length - 1] || "v0";

    const latestVersionMatch = latestVersion.match(API_REVISION_REGEX)!;
    const latestVersionNumber = Number(latestVersionMatch[1]);

    const newVersion = latestVersionMatch[2] ?
        `v${latestVersionNumber}` :
        `v${latestVersionNumber + 1}`;

    lockfile.routes[newVersion] = lockfile.routes[latestVersion] || {};

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );

    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});

    success(`API bumped to ${newVersion}.`);
}

async function alpha() {
    const { lockfile, repoFolderStructure, rpcPath } = requiresRpcInit();

    const versions = sortVersions(Object.keys(lockfile.routes));
    const latestVersion = versions[versions.length - 1] || "v0";

    const latestVersionMatch = latestVersion.match(API_REVISION_REGEX)!;
    const latestVersionNumber = Number(latestVersionMatch[1]);

    // Try to get the last alpha version of this major if it exists.
    let lastMajorAlpha: string | null = null;
    for (let i = versions.length - 1; i >= 0; i--) {
        const version = versions[i];
        if (version.startsWith(`v${latestVersionNumber}a`)) {
            lastMajorAlpha = version.split("a")[1];
            break;
        } else if (!version.startsWith(`v${latestVersionNumber}b`)) {
            break;
        }
    }

    const newVersion = lastMajorAlpha ?
        `v${latestVersionNumber}a${Number(lastMajorAlpha) + 1}` :
        `v${latestVersionNumber + 1}a1`;
    lockfile.routes[newVersion] = lockfile.routes[latestVersion] || {};

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );

    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});

    success(`API bumped to ${newVersion}.`);
}

async function beta() {
    const { lockfile, repoFolderStructure, rpcPath } = requiresRpcInit();

    const versions = sortVersions(Object.keys(lockfile.routes));
    const latestVersion = versions[versions.length - 1] || "v0";

    const latestVersionMatch = latestVersion.match(API_REVISION_REGEX)!;
    const latestVersionNumber = Number(latestVersionMatch[1]);

    // Try to get the last beta version of this major if it exists.
    let lastMajorBeta: string | null = null;
    for (let i = versions.length - 1; i >= 0; i--) {
        const version = versions[i];
        if (version.startsWith(`v${latestVersionNumber}b`)) {
            lastMajorBeta = version.split("b")[1];
            break;
        } else if (!version.startsWith(`v${latestVersionNumber}a`)) {
            break;
        }
    }

    const newVersion = lastMajorBeta ?
        `v${latestVersionNumber}b${Number(lastMajorBeta) + 1}` :
        `v${latestVersionNumber}b1`;
    lockfile.routes[newVersion] = lockfile.routes[latestVersion] || {};

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );

    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});

    success(`API bumped to ${newVersion}.`);
}

async function drop([init, version]: RPCVersionWithCache) {
    const { lockfile, rpcPath, repoFolderStructure } = init;

    // Handle the filesystem in accordance to versions.
    const versions = sortVersions(Object.keys(lockfile.routes));
    const versionAfter = versions[versions.indexOf(version) + 1];
    if (versionAfter) {
        // Figure out any methods that were removed in this version.
        const removedMethods: string[] = [];
        function scanObject(
            obj1: { [key: string]: any },
            obj2: { [key: string]: any },
            namespace: string[],
        ) {
            for (const [key, value] of Object.entries(obj1)) {
                if (!obj2[key]) {
                    function addToDropList(a: string[], obj: string | { [key: string]: any }) {
                        if (typeof obj === "string") {
                            removedMethods.push(a.join(sep) + ".ts");
                        } else {
                            for (const [k, v] of Object.entries(obj)) {
                                a.push(k);
                                addToDropList(a, v);
                                a.pop();
                            }
                        }
                    }
                    namespace.push(key);
                    addToDropList(namespace, value);
                    namespace.pop();
                } else if (typeof value === "object") {
                    namespace.push(key);
                    scanObject(value, obj2[key], namespace);
                    namespace.pop();
                }
            }
        }
        scanObject(
            lockfile.routes[version] as { [key: string]: any },
            lockfile.routes[versionAfter] as { [key: string]: any },
            [],
        );

        // Move the methods to the next version.
        async function moveFolder(old: string, new_: string, namespace: string[]) {
            const promises: Promise<void>[] = [];
            for (const file of await readdir(join(old, ...namespace))) {
                const nsChunk = join(...namespace, file);
                if (removedMethods.includes(nsChunk)) {
                    continue;
                }

                const oldPath = join(old, nsChunk);
                const newPath = join(new_, nsChunk);
                try {
                    const s = await stat(newPath);
                    if (!s.isDirectory()) {
                        // Do not overwrite files.
                        continue;
                    }
                } catch {}
                const s = await stat(oldPath);
                if (s.isDirectory()) {
                    // Make sure the directory exists.
                    await mkdir(newPath, { recursive: true });
                }

                promises.push(
                    rename(oldPath, newPath).catch(() => {
                        // If it fails, it is a directory. Recurse.
                        return moveFolder(old, new_, [...namespace, file]);
                    }),
                );
            }
            await Promise.all(promises);
        }
        mkdirSync(join(rpcPath, "routes", versionAfter), { recursive: true });
        await moveFolder(
            join(rpcPath, "routes", version),
            join(rpcPath, "routes", versionAfter),
            [],
        );
    }

    // Delete the old folder.
    try {
        rmSync(join(rpcPath, "routes", version), { recursive: true });
    } catch {
        // This is probably just aliasing.
    }

    // Remove the version from the lockfile and modify any references to the old version.
    for (let i = versions.length - 1; i >= 0; i--) {
        const v = versions[i];
        if (v === version) break;
        const path = `./routes/${version}`;
        function scan(o: {[key: string]: any}) {
            for (const [k, v] of Object.entries(o)) {
                if (typeof v === "object") {
                    scan(v);
                } else if (typeof v === "string" && v.startsWith(path)) {
                    o[k] = `./routes/${versionAfter}${v.slice(path.length)}`;
                }
            }
        }
        scan(lockfile.routes[v] as { [key: string]: any });
    }
    delete lockfile.routes[version];

    // Write the lockfile.
    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );

    // Re-generate the client and report a success.
    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});
    success(`API version ${version} dropped.`);
}

async function deprecate([init, version]: RPCVersionWithCache, reason: string) {
    const { rpcPath, repoFolderStructure } = init;

    let description = "";
    try {
        description = readFileSync(
            join(rpcPath, "descriptions", `${version}.md`), "utf-8",
        );
    } catch {
        // No description.
    }
    description = description.trim();

    const s = description.split("\n");
    if (s[s.length - 1].startsWith("**Deprecated:**")) {
        error("This version is already deprecated.");
    }

    if (description !== "") {
        description += "\n\n";
    }

    writeFileSync(
        join(rpcPath, "descriptions", `${version}.md`),
        `${description}**Deprecated:** ${reason}`,
    );

    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});

    success(`API version ${version} deprecated.`);
}

export function versions(cmd: Command) {
    const root = cmd
        .description("Handle the versioning of your API.");

    root.command("bump")
        .description("Bumps the version of your API to a new stable release.")
        .action(bump);

    root.command("alpha")
        .description("Bumps the version of your API to a new alpha release.")
        .action(alpha);

    root.command("beta")
        .description("Bumps the version of your API to a new beta release.")
        .action(beta);

    root.command("drop")
        .description("Drops the version of the API which is specified.")
        .addArgument(argumentWithParser("<version>", "The version to drop.", versionParser))
        .action(drop);

    root.command("deprecate")
        .description("Adds a deprecation notice to the specified version.")
        .addArgument(argumentWithParser("<version>", "The version to deprecate.", versionParser))
        .argument("[reason]", "The reason for deprecation.", "This version is deprecated.")
        .action(deprecate);
}
