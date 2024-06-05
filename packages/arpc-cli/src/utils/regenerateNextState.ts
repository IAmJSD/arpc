import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { RepoFolderStructure } from "./findRepoFolderStructure";
import { generateClient } from "./generateClient";

export async function regenerateNextState(repoFolderStructure: RepoFolderStructure, rpcPath: string) {
    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    const buildData = await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});
    writeFileSync(join(rpcPath, "build_data.json"), JSON.stringify(buildData, null, "\t"));
}
