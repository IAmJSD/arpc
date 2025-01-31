import { join } from "path";
import { mkdirSync, writeFileSync, statSync } from "fs";
import { RepoFolderStructure } from "./findRepoFolderStructure";
import { generateClient } from "./generateClient";
import { getBuildData } from "./getBuildData";

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
    const buildData = await getBuildData(repoFolderStructure.framework.folder);
    await generateClient("typescript", buildData, join(clientsFolder, "rpc.ts"), "", "", {});
    writeFileSync(join(rpcPath, "build_data.json"), JSON.stringify(buildData, null, "\t"));
}
