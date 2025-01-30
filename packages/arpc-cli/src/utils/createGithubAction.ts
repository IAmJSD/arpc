import { stat } from "fs/promises";
import { join, sep } from "path";
import { RepoFolderStructure } from "./findRepoFolderStructure";

const p1 = `on:
  push:
    branches:
        - main
  pull_request: {}

name: Validate and compare the arpc schema

jobs:
    main_lint:
        name: "Compare to the previous main commit"
        runs-on: ubuntu-20.04
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        steps:
            - name: Install arpc
              run: npm install -g arpc
            - name: Checkout
              uses: actions/checkout@v4`;

const p2 = `            - name: Get the previous commit
              run: git checkout HEAD^
            - name: Run arpc on the last commit
              run: arpc lint --output /tmp/last_commit.json
            - name: Get the last commit
              run: git checkout main
            - name: Run arpc on the current commit
              run: arpc lint --compare /tmp/last_commit.json

    pr_lint:
        name: "Compare to the base branch of the PR"
        runs-on: ubuntu-20.04
        if: github.event_name == 'pull_request'
        steps:
            - name: Install arpc
              run: npm install -g arpc
            - name: Checkout
              uses: actions/checkout@v4`;

const p3 = `            - name: Get the base branch
              run: git checkout \${{ github.base_ref }}
            - name: Run arpc on the base branch
              run: arpc lint --output /tmp/base_branch.json
            - name: Get the head branch
              run: git checkout \${{ github.head_ref }}
            - name: Run arpc on the head branch
              run: arpc lint --compare /tmp/base_branch.json
`;

export async function createGithubAction(repoFolderStructure: RepoFolderStructure) {
    if (repoFolderStructure.packageManager === "bun") {
        // Handle Bun since it is its own runtime too.
        let cdPart = "";
        if (repoFolderStructure.gitFolder) {
            try {
                // Check if the file exists.
                try {
                    await stat(join(repoFolderStructure.framework.folder, "bun.lockb"));
                } catch {
                    // Check if its Bun's new lockfile format.
                    await stat(join(repoFolderStructure.framework.folder, "bun.lock"));
                }
    
                // Get the difference between the two folders.
                let diff = repoFolderStructure.framework.folder.slice(repoFolderStructure.gitFolder.length);
                if (!diff.startsWith(sep)) diff = sep + diff;
                cdPart = `cd .${diff.replace(
                    new RegExp("\\" + sep, "g"),
                    "/",
                )} && `;
            } catch {}
        }

        const part = `            - uses: oven-sh/setup-bun@v1
              with:
                bun-version: 'latest'
            - name: Install dependencies
              run: ${cdPart}bun install`;
        return [p1, part, p2, part, p3].join("\n");
    }

    // Figure out where .nvmrc is.
    let nvmrcPath = ".nvmrc";
    try {
        // Check if the file exists.
        await stat(join(repoFolderStructure.framework.folder, ".nvmrc"));

        // If it does, compare it to the root.
        let diff = repoFolderStructure.framework.folder.slice(repoFolderStructure.gitFolder!.length);
        if (diff.startsWith(sep)) diff = diff.slice(1);
        nvmrcPath = `${diff.replace(new RegExp("\\" + sep, "g"), "/")}.nvmrc`;
    } catch {}

    // Define the setup node action.
    const useNode = `            - uses: actions/setup-node@v4
              with:
                node-version-file: '${nvmrcPath}'`;

    // Figure out where the package manager is.
    let fp: string | null = null;
    if (repoFolderStructure.monorepo) {
        let diff = repoFolderStructure.framework.folder.slice(repoFolderStructure.gitFolder!.length);
        if (diff.startsWith(sep)) diff = diff.slice(1);
        fp = diff.replace(new RegExp("\\" + sep, "g"), "/");
    }

    // Figure out the install action.
    let runInstall = " true";
    if (fp) {
        runInstall = `
                  cwd: "${fp}"`;
    }
    let installAction = `            - name: Install dependencies
              run: ${fp ? `cd ${fp} && ` : ""}${repoFolderStructure.packageManager === "yarn" ? "yarn install" : "npm install"}`;
    if (repoFolderStructure.packageManager === "pnpm") {
        installAction = `            - uses: pnpm/action@v4
              with:
                run_install:${runInstall}`;
    }

    // Return the action.
    return [p1, useNode, installAction, p2, useNode, installAction, p3].join("\n");
}
