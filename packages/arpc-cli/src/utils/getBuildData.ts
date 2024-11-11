import esbuild from "esbuild";
import { join } from "path";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import type { BuildData } from "@arpc-packages/client-gen";
import { error } from "./console";
import { spawn } from "child_process";

export async function getBuildData(frameworkFolder: string) {
    // Create a temporary folder.
    const tmpFolder = await mkdtemp(join(frameworkFolder, "node_modules", ".arpc-"));
    async function tidy() {
        try {
            await rm(tmpFolder, { recursive: true });
        } catch {
            // Ignore.
        }
    }

    // Defines the RPC outfile.
    const outfile = join(tmpFolder, "rpc.cjs");

    try {
        // Build the RPC.
        await esbuild.build({
            absWorkingDir: frameworkFolder,
            entryPoints: [join(frameworkFolder, "rpc/index.ts")],
            target: "node18",
            platform: "node",
            bundle: true,
            sourcemap: true,
            packages: "external",
            outfile,
        });
    } catch {
        // esbuild logs out anyway why it errored.
        await tidy();
        process.exit(1);
    }

    // Defines the environment the bootstrapper will run in.
    const env = { ...process.env };
    delete env.PWD;

    // Write a bootstrapper to get the JSON out of the RPC.
    const bootstapper = `const { generateSchema } = require("./rpc.cjs");
const { join } = require("path");
const { writeFileSync } = require("fs");

generateSchema().then(s => {
    writeFileSync(join(__dirname, "schema.json"), JSON.stringify(s));
}).catch(e => {
    console.error("Could not generate the schema:", e);
    process.exit(1);
});
`;
    const bootstrapperFile = join(tmpFolder, "bootstrapper.cjs");
    await writeFile(bootstrapperFile, bootstapper);

    try {
        // Run node.
        await new Promise<void>((res, rej) => {
            const proc = spawn(
                "node", ["--enable-source-maps", bootstrapperFile], {
                    cwd: frameworkFolder, shell: env.SHELL || true, env,
                    stdio: ["inherit", "inherit", "inherit"],
                },
            );
            proc.on("error", rej);
            proc.on("exit", (code) => {
                if (code !== 0) {
                    rej(new Error(`Node exited with code ${code}`));
                    return;
                }
                res();
            });
        });

        // Read the output.
        const res = await readFile(join(tmpFolder, "schema.json"), "utf8");

        // Parse the output.
        let x: BuildData;
        try {
            x = JSON.parse(res);
        } catch (e) {
            throw new Error(`Could not parse ${res}: ${(e as Error).message}`);
        }
        await tidy();
        return x;
    } catch (e) {
        // Clean up the temporary folder.
        await tidy();

        // Log the error.
        error(`Could not evaluate the RPC router: ${(e as Error).message}`);
    }
}
