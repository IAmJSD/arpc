import type { Command } from "commander";
import chokidar from "chokidar";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { success } from "../utils/console";
import { regenerateFrameworkState } from "../utils/regenerateFrameworkState";
import { setThrowWith } from "../utils/exitOrThrow";

const customThrow = Symbol("customThrow");

function cmdAction() {
    const { repoFolderStructure, rpcPath } = requiresRpcInit();

    // For some reason, I need to do this on WSL.
    let hundredMillisPassed = false;
    setTimeout(() => {
        hundredMillisPassed = true;
    }, 100);

    setThrowWith(customThrow);

    chokidar.watch(rpcPath).on("all", (_, path) => {
        if (!hundredMillisPassed) return;
        if (path.endsWith("build_data.json")) return;
        regenerateFrameworkState(repoFolderStructure, rpcPath)
            .catch((err) => {
                if (err !== customThrow) {
                    const text = (err as Error).message;
                    console.error(`\x1b[31m✖  Failed to generate local JS client: ${text}\x1b[0m`);
                }
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
