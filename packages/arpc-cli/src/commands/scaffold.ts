import { InvalidArgumentError, type Command } from "commander";
import { join } from "path";
import { statSync, writeFileSync, mkdirSync } from "fs";
import { stringify } from "@arpc-packages/lockfile";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { error, success } from "../utils/console";
import { argumentWithParser } from "../utils/argumentWithParser";
import { regenerateNextState } from "../utils/regenerateNextState";

async function scaffoldAuthentication() {
    const { rpcPath, lockfile, repoFolderStructure } = requiresRpcInit();

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

type Unpromisify<T> = T extends Promise<infer U> ? U : T;

export type UserExport = Unpromisify<ReturnType<typeof validate>>;
`);
    }

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );

    await regenerateNextState(repoFolderStructure, rpcPath);
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
        writeFileSync(ratelimitingFile, `${userImport}import { Ratelimited } from "@arpc-packages/core";

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

function scaffoldException(name: string) {
    const { rpcPath, lockfile } = requiresRpcInit();

    if (lockfile.exceptions[name]) {
        error("The exception already exists.");
    }

    const exceptionFile = join(rpcPath, "exceptions", `${name}.ts`);
    try {
        // Check if the file already exists.
        statSync(exceptionFile);
    } catch {
        // Write the file.
        mkdirSync(join(rpcPath, "exceptions"), { recursive: true });
        writeFileSync(exceptionFile, `export class ${name} extends Error {
    get body() {
        // TODO: Return a body that is useful to the user.
        return null;
    }
}
`);
    }
    lockfile.exceptions[name] = `./exceptions/${name}`;

    writeFileSync(
        join(rpcPath, "index.ts"),
        stringify(lockfile),
    );
    success(`Exception ${name} set up.`);
}

function nameParser(name: string) {
    if (!/^[a-zA-Z]+$/.test(name)) {
        throw new InvalidArgumentError("The name must only contain letters.");
    }
    return name;
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

    root.command("exception")
        .addArgument(argumentWithParser("<name>", "The name of the exception.", nameParser))
        .description("Adds a custom exception.")
        .action(scaffoldException);
}
