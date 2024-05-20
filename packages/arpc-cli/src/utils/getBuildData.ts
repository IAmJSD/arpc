import esbuild from "esbuild";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import type { BuildData } from "@arpc/client-gen";
import { error } from "./console";

export async function getBuildData(nextFolder: string) {
    // Create a temporary folder.
    const tmpFolder = await mkdtemp("arpc-");
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

    let generateSchema: () => Promise<BuildData>;
    try {
        generateSchema = (await import(outfile)).generateSchema;
    } catch (e) {
        // Clean up the temporary folder.
        await tidy();

        // Log the error.
        error(`Could not import the RPC: ${(e as Error).message}`);
    }

    // Clean up the temporary folder.
    await tidy();

    // Return the schema.
    return generateSchema();
}
