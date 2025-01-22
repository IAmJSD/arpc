import { join } from "path";
import { mkdirSync, writeFileSync, statSync } from "fs";
import { RepoFolderStructure } from "./findRepoFolderStructure";
import { generateClient } from "./generateClient";

export async function regenerateFrameworkState(repoFolderStructure: RepoFolderStructure, rpcPath: string) {
    let srcFolder = repoFolderStructure.framework.folder;
    try {
        const src = join(srcFolder, "src");
        if (statSync(src).isDirectory()) srcFolder = src;
    } catch {}

    let clientsFolder = join(srcFolder, "clients");
    try {
        const lib = join(srcFolder, "lib");
        if (statSync(lib).isDirectory()) {
            clientsFolder = join(lib, "clients");
        }
    } catch {}
    mkdirSync(clientsFolder, { recursive: true });
    const folder = repoFolderStructure.framework.folder;
    const buildData = await generateClient("typescript", folder, join(clientsFolder, "rpc.ts"), "", "", {});
    writeFileSync(join(rpcPath, "build_data.json"), JSON.stringify(buildData, null, "\t"));
}
