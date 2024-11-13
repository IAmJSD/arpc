import { readdirSync, statSync } from "fs";
import { join } from "path";
import { Framework, findFramework } from "./frameworks";

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export type RepoFolderStructure = {
    packageManager: PackageManager;
    monorepo: boolean;
    framework: Framework;
    gitFolder: string | null;
};

function findPackageManager(folder: string): PackageManager | null {
    const files = new Set(readdirSync(folder));
    if (files.has("yarn.lock")) return "yarn";
    if (files.has("pnpm-lock.yaml")) return "pnpm";
    if (files.has("bun.lockb")) return "bun";
    if (files.has("package-lock.json")) return "npm";
    return null;
}

// Gets the repo folder structure, including figuring out if this is a monorepo.
// This is synchronous because it is only ran once at the start. Making this async
// would actually make it slower.
export function findRepoFolderStructure() {
    // Task 1: Find where the framework is.
    const framework = findFramework();
    if (!framework) return null;

    // Task 2: Find the git folder.
    let folder = framework.folder;
    let gitFolder: string | null = null;
    for (;;) {
        // Join .git to the folder.
        const git = join(folder, ".git");
        try {
            // Check if this is a directory.
            let s = statSync(git);
            if (s.isDirectory()) {
                // Check if package.json exists.
                s = statSync(join(folder, "package.json"));
                if (s.isFile()) {
                    // We found the git folder.
                    gitFolder = folder;
                    break;
                }
            }
        } catch {
            // Not a directory.
        }

        // Go up a folder.
        folder = join(folder, "..");
        if (folder === "/") {
            // No git
            break;
        }
    }

    // Task 3: Find the package manager.
    let packageManager = findPackageManager(framework.folder);
    let monorepo = false;
    if (!packageManager) {
        // No package lock information found in the framework folder.
        // If there's a git folder, check that.
        if (gitFolder) {
            // Try and check the package manager of the Git folder.
            packageManager = findPackageManager(gitFolder);
            if (!packageManager) {
                // There is no package manager in the repo. Presume npm.
                packageManager = "npm";
            }

            // We also presume this is a monorepo because the package lock is in a
            // parent folder.
            monorepo = true;
        } else {
            // We have to presume npm.
            packageManager = "npm";
        }
    }

    // Return the result.
    return { packageManager, monorepo, framework, gitFolder };
}
