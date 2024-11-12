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

    const clientsFolder = join(srcFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    const buildData = await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});
    writeFileSync(join(rpcPath, "build_data.json"), JSON.stringify(buildData, null, "\t"));
}
