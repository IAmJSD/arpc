import { join } from "path";
import * as ClientGen from "@arpc/client-gen";
import { getBuildData } from "./getBuildData";

type Generators = {
    [key: string]: [any, {
        [key: string]: "string" | "number" | "boolean";
    }];
};

export const generators: Generators = {
    typescript: [ClientGen.typescript, {}],
    php: [ClientGen.php, {}],
    "python-async": [ClientGen.pythonAsync, {}],
    "python-sync": [ClientGen.pythonSync, {}],
} as const;

export async function generateClient<Key extends keyof typeof generators>(
    generator: Key, rpcPath: string, filePath: string,
    options: {[key: string]: any},
) {
    const buildData = await getBuildData(join(rpcPath, ".."));
    return generators[generator][0](buildData, filePath, options);
}
