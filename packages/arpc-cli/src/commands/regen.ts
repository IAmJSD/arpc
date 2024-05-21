import type { Command } from "commander";
import { mkdirSync } from "fs";
import { join } from "path";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { generateClient } from "../utils/generateClient";
import { success } from "../utils/console";

async function cmdAction() {
    const { repoFolderStructure, rpcPath } = requiresRpcInit();

    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");
    mkdirSync(clientsFolder, { recursive: true });
    await generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {});

    success("RPC client regenerated.");
}

export function regen(cmd: Command) {
    cmd.
        description("Regenerates the RPC client.").
        action(cmdAction);
}
