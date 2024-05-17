import type { Command } from "commander";
import { join } from "path";
import { statSync, writeFileSync } from "fs";
import { stringify } from "@arpc/lockfile";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { error, success } from "../utils/console";

function scaffoldAuthentication() {
    const { rpcPath, lockfile } = requiresRpcInit();

    if (lockfile.hasAuthentication) {
        error("Authentication is already set up.");
    }
    lockfile.hasAuthentication = true;

    const authFile = join(rpcPath, "authentication.ts");
    try {
        // Check if the file already exists.
        statSync(authFile);
    } catch {
        // Write the file.
        writeFileSync(authFile, `export enum TokenTypes {
    BEARER = "Bearer",
}

export const defaultTokenType = TokenTypes.BEARER;

export async function validate(token: string, tokenType: TokenTypes) {
    // TODO: Return your user here.
    return null;
}

export type UserExport = ReturnType<typeof validate>;
`);
    }

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );
    success("Authentication set up.");
}

function scaffoldRatelimiting() {
    const { rpcPath, lockfile } = requiresRpcInit();

    if (lockfile.hasRatelimiting) {
        error("Ratelimiting is already set up.");
    }
    lockfile.hasRatelimiting = true;

    const ratelimitingFile = join(rpcPath, "ratelimiting.ts");
    try {
        // Check if the file already exists.
        statSync(ratelimitingFile);
    } catch {
        // Check if authentication is enabled.
        let userImport = "";
        let userType = "";
        if (lockfile.hasAuthentication) {
            userImport = `import type { UserExport } from "./authentication";
`;
            userType = ", user: UserExport";
        }

        // Write the file.
        writeFileSync(ratelimitingFile, `${userImport}import { Ratelimited } from "@arpc/core";

export default async function ratelimit(methodName: string, arg: any${userType}) {
    // TODO: Implement your ratelimiting logic here. If a user is ratelimited, you
    // should throw a Ratelimited error.
}
`);
    }

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );
    success("Ratelimiting set up.");
}

export function scaffold(cmd: Command) {
    const root = cmd
        .description("Sets up the scaffolding for supporting optional features.");

    root.command("authentication")
        .description("Sets up authentication.")
        .action(scaffoldAuthentication);

    root.command("ratelimiting")
        .description("Sets up ratelimiting.")
        .action(scaffoldRatelimiting);
}
