import type { Command } from "commander";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { success } from "../utils/console";
import { regenerateFrameworkState } from "../utils/regenerateFrameworkState";

async function cmdAction() {
    const { repoFolderStructure, rpcPath } = requiresRpcInit();

    await regenerateFrameworkState(repoFolderStructure, rpcPath);
    success("RPC client regenerated.");
}

export function regen(cmd: Command) {
    cmd.
        description("Regenerates the RPC client.").
        action(cmdAction);
}
