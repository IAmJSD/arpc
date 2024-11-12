import { join, sep } from "path";
import { stat, readFile, writeFile } from "fs/promises";

const IGNORES = [
    "clients/rpc.ts",
    "rpc/index.ts",
    "rpc/build_data.json",
];

async function processFile(fp: string, prefix: string, file: string) {
    const split = file.trim().split("\n");
    for (const ignore of IGNORES) {
        const path = prefix + ignore;
        let found = false;
        for (const s of split) {
            if (path.startsWith(s)) {
                found = true;
                break;
            }
        }
        if (!found) {
            if (split.length !== 0) {
                // Make a new gap.
                split.push("");
            }
            split.push(path);
        }
    }
    split.push("");
    await writeFile(fp, split.join("\n"));
}

export async function handleIgnoreFile(
    file: string, gitFolder: string | null, frameworkFolder: string,
) {
    // Get the initial prefix.
    let prefix = "";
    try {
        if ((await stat(join(frameworkFolder, "src"))).isDirectory()) prefix = "src/";
    } catch {}

    if (gitFolder) {
        // Check if there's an ignore file there.
        let ignore: string | null = null;
        const gf = join(gitFolder, file);
        try {
            ignore = await readFile(gf, "utf-8");
        } catch {}

        // If an ignore file is present, add to the prefix and process it now.
        if (ignore !== null) {
            const p1 = gitFolder.split(sep);
            const frags = frameworkFolder.split(sep).slice(p1.length).filter((x) => x !== "");

            prefix = frags.join("/") + "/" + prefix;

            return processFile(gf, prefix, ignore);
        }
    }

    // Otherwise, just process the file normally.
    let contents = "";
    const fp = join(frameworkFolder, file);
    try {
        contents = await readFile(fp, "utf-8");
    } catch {}
    return processFile(fp, prefix, contents);
}
