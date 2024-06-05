import type { Command } from "commander";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { success } from "../utils/console";
import { regenerateNextState } from "../utils/regenerateNextState";

async function cmdAction() {
    const { repoFolderStructure, rpcPath } = requiresRpcInit();

    await regenerateNextState(repoFolderStructure, rpcPath);
    success("RPC client regenerated.");
}

export function regen(cmd: Command) {
    cmd.
        description("Regenerates the RPC client.").
        action(cmdAction);
}
