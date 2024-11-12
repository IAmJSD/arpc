import { join } from "path";
import { statSync } from "fs";

// Finds the RPC folder synchronously.
export function findRpcFolderSync(frameworkFolder: string) {
    try {
        const srcRpc = join(frameworkFolder, "src", "rpc");
        if (statSync(srcRpc).isDirectory()) {
            // lgtm
            return srcRpc;
        }
    } catch {}
    return join(frameworkFolder, "rpc");
}
