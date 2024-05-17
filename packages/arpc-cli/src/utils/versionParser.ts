import { InvalidArgumentError } from "commander";
import { requiresRpcInit } from "./requiresRpcInit";

export type RPCVersionWithCache = [ReturnType<typeof requiresRpcInit>, string];

export function versionParser(version: string) {
    const init = requiresRpcInit();
    if (!init.lockfile.routes[version]) {
        version = `v${init.lockfile.routes[version]}`;
        if (!init.lockfile.routes[version]) {
            throw new InvalidArgumentError("Version not found.");
        }
    }
    return [init, version];
}
