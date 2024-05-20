import esbuild from "esbuild";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import type { BuildData } from "@arpc/client-gen";
import { error } from "./console";
import { exec } from "child_process";

// Defines a string to give to node to evaluate the RPC schema.
const evalString = (fp: string) =>
    `require(${JSON.stringify(fp)}).generateSchema().`
    + "then(x => console.log(JSON.stringify(x)))."
    + "catch(err => { console.error(err); process.exit(1); })";

export async function getBuildData(nextFolder: string) {
    // Create a temporary folder.
    const tmpFolder = await mkdtemp(join(nextFolder, "arpc-"));
    async function tidy() {
        try {
            await rm(tmpFolder, { recursive: true });
        } catch {
            // Ignore.
        }
    }

    // Defines the RPC outfile.
    const outfile = join(tmpFolder, "rpc.js");

    try {
        // Build the RPC.
        await esbuild.build({
            absWorkingDir: nextFolder,
            entryPoints: [join(nextFolder, "rpc/index.ts")],
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

    // Run node in the same shell with the RPC.
    const evalStr = evalString(outfile);
    const env = { ...process.env };
    delete env.PWD;

    // Add path to node requires.
    env.NODE_PATH = join(nextFolder, "rpc");

    try {
        // Run node.
        const res = await new Promise<string>((res, rej) => exec(`node --enable-source-maps -e '${evalStr}'`, {
            cwd: nextFolder, shell: env.SHELL || undefined, env,
        }, (err, stdout, stderr) => {
            if (err) {
                rej(err);
            }
            if (stderr) {
                rej(new Error(`Could not run the RPC: ${stderr}`));
            }
            res(stdout);
        }));

        // Parse the output.
        const x = JSON.parse(res) as BuildData;
        await tidy();
        return x;
    } catch (e) {
        // Clean up the temporary folder.
        await tidy();

        // Log the error.
        error(`Could not run the RPC: ${(e as Error).message}`);
    }
}
