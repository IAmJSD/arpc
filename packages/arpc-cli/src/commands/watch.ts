import type { Command } from "commander";
import chokidar from "chokidar";
import { join } from "path";
import { mkdirSync } from "fs";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { generateClient } from "../utils/generateClient";
import { success } from "../utils/console";

function cmdAction() {
    const { repoFolderStructure, rpcPath } = requiresRpcInit();
    const clientsFolder = join(repoFolderStructure.nextFolder, "clients");

    // For some reason, I need to do this on WSL.
    let hundredMillisPassed = false;
    setTimeout(() => {
        hundredMillisPassed = true;
    }, 100);

    chokidar.watch(rpcPath).on("all", () => {
        if (!hundredMillisPassed) return;
        mkdirSync(clientsFolder, { recursive: true });
        generateClient("typescript", rpcPath, join(clientsFolder, "rpc.ts"), "", "", {}, true)
            .catch((err) => {
                const text = (err as Error).message;
                console.error(`\x1b[31m✖  Failed to generate local JS client: ${text}\x1b[0m`)
            })
            .then(() => {
                success("Generated local JS client.");
            });
    });
}

export function watch(cmd: Command) {
    cmd
        .description("Watches the RPC server for changes.")
        .action(cmdAction);
}
