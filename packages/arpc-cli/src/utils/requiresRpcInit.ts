import { join } from "path";
import { readFileSync } from "fs";
import { Lockfile, parse } from "@arpc-packages/lockfile";
import { error } from "./console";
import { findRepoFolderStructure } from "./findRepoFolderStructure";

export function requiresRpcInit() {
    const repoFolderStructure = findRepoFolderStructure();
    if (!repoFolderStructure) {
        error("Could not find a project in a compatible framework.");
    }
    const rpc = join(repoFolderStructure.framework.folder, "rpc");

    let lockfileText: string;
    try {
        lockfileText = readFileSync(join(rpc, "index.ts"), "utf-8");
    } catch {
        error("Could not read the lock file. Have you initalized arpc?");
    }
    let lockfile: Lockfile;
    try {
        lockfile = parse(lockfileText);
    } catch (err) {
        error(`Could not parse the lock file: ${(err as Error).message}`);
    }

    return { repoFolderStructure, rpcPath: rpc, lockfile, lockfileText };
}
