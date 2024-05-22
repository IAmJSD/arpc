import { join } from "path";
import * as ClientGen from "@arpc/client-gen";
import { writeFile } from "fs/promises";
import { getBuildData } from "./getBuildData";
import { error } from "./console";

type Generators = {
    [key: string]: [any, {
        [key: string]: "string" | "number" | "boolean";
    }];
};

export const generators: Generators = {
    typescript: [ClientGen.typescript, {}],
    php: [ClientGen.php, {
        namespace: "string",
    }],
    "python-async": [ClientGen.pythonAsync, {}],
    "python-sync": [ClientGen.pythonSync, {}],
} as const;

export async function generateClient<Key extends keyof typeof generators>(
    generator: Key, rpcPath: string, filePath: string, protocol: string, hostname: string,
    options: {[key: string]: any}, justThrow?: boolean,
) {
    const buildData = await getBuildData(join(rpcPath, ".."));
    for (const c of buildData.clients) {
        c.defaultProtocol = protocol;
        c.defaultHostname = hostname;
    }

    let res: string;
    try {
        res = generators[generator][0](buildData, options);
    } catch (err) {
        if (justThrow) {
            throw err;
        }
        error(`Failed to generate client: ${(err as Error).message}`);
    }

    try {
        await writeFile(filePath, res);
    } catch (err) {
        if (justThrow) {
            throw err;
        }
        error(`Failed to write client to ${filePath}: ${(err as Error).message}`);
    }
}
