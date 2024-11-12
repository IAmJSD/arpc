import { InvalidArgumentError, type Command } from "commander";
import { generateClient, generators } from "../utils/generateClient";
import { argumentWithParser } from "../utils/argumentWithParser";
import { requiresRpcInit } from "../utils/requiresRpcInit";
import { success } from "../utils/console";

function hostnameParser(hostname: string) {
    if (!hostname.startsWith("http://") && !hostname.startsWith("https://")) {
        hostname = `https://${hostname}`;
    }
    try {
        return new URL(hostname);
    } catch {
        throw new InvalidArgumentError("Invalid hostname.");
    }
}

function type2parser(type: "string" | "number" | "boolean"): any {
    switch (type) {
    case "string":
        // Ignore this.
        return (x: string) => x;
    case "number":
        return (x: string) => {
            const n = Number(x);
            if (isNaN(n)) {
                throw new InvalidArgumentError("Invalid number.");
            }
            return n;
        };
    case "boolean":
        return (x: string) => {
            if (x === "true") {
                return true;
            } else if (x === "false") {
                return false;
            }
            throw new InvalidArgumentError("Invalid boolean.");
        };
    }
}

export function generate(cmd: Command) {
    const root = cmd
        .description("Generates a client for the given programming language.");

    const keys = Object.keys(generators).sort();
    for (const key of keys) {
        let cmd = root
            .command(key)
            .addArgument(argumentWithParser(
                "<hostname>",
                "The hostname (optionally with protocol) where the arpc server is running.",
                hostnameParser,
            ))
            .argument("<output>", "The output file for the client.")
            .description(`Generates a client for ${key}.`);

        for (const [name, type] of Object.entries(generators[key][1])) {
            cmd = cmd.option("--" + name, `Configures ${name} for the generator.`, type2parser(type));
        }

        cmd.action(async (hostname: URL, output: string, options: {[key: string]: any}) => {
            const { repoFolderStructure } = requiresRpcInit();
            await generateClient(
                key, repoFolderStructure.framework.folder, output, hostname.protocol.slice(0, -1),
                `${hostname.hostname}${hostname.port === "" ? "" : `:${hostname.port}`}`,
                options,
            );
            success("Client generated.");
        });
    }
}
