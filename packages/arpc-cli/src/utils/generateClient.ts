import * as ClientGen from "@arpc-packages/client-gen";
import { writeFile } from "fs/promises";
import { error } from "./console";
import type { BuildData } from "@arpc-packages/client-gen";

type Generators = {
    [key: string]: [any, {
        [key: string]: "string" | "number" | "boolean";
    }];
};

export const generators: Generators = {
    golang: [ClientGen.golang, {}],
    typescript: [ClientGen.typescript, {}],
    php: [ClientGen.php, {
        namespace: "string",
    }],
    "python-async": [ClientGen.pythonAsync, {}],
    "python-sync": [ClientGen.pythonSync, {}],
} as const;

export async function generateClient<Key extends keyof typeof generators>(
    generator: Key, buildData: BuildData, filePath: string, protocol: string, hostname: string,
    options: {[key: string]: any}, justThrow?: boolean,
) {
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
