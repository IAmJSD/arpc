import { InvalidArgumentError, type Command } from "commander";
import { parse } from "node-html-parser";
import { generateClient, generators } from "../utils/generateClient";
import { argumentWithParser } from "../utils/argumentWithParser";
import { error, success } from "../utils/console";

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

async function getBuildDataFromHttp(hostname: URL) {
    const res = await fetch(hostname);
    if (!res.ok) {
        error(`Failed to fetch build data: status ${res.status}`);
    }
    const html = await res.text();
    const root = parse(html);
    const buildData = root.querySelector("#arpc_schema");
    if (!buildData) {
       error("Failed to find build data.");
    }
    return JSON.parse(buildData.innerText);
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
            .addArgument(argumentWithParser(
                "[target hostname]",
                "The hostname (optionally with protocol) where the arpc server will be deployed.",
                hostnameParser,
            ))
            .description(`Generates a client for ${key}.`);

        for (const [name, type] of Object.entries(generators[key][1])) {
            cmd = cmd.option("--" + name, `Configures ${name} for the generator.`, type2parser(type));
        }

        cmd.action(async (hostname: URL, output: string, targetHostname: URL | undefined, options: {[key: string]: any}) => {
            hostname.pathname = "/api/rpc/docs";
            if (!targetHostname) {
                targetHostname = hostname;
            }
            const buildData = await getBuildDataFromHttp(hostname);
            await generateClient(
                key, buildData, output, targetHostname.protocol.slice(0, -1),
                `${targetHostname.hostname}${targetHostname.port === "" ? "" : `:${targetHostname.port}`}`,
                options,
            );
            success("Client generated.");
        });
    }
}
