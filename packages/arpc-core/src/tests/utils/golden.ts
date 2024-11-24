import { it, expect } from "vitest";
import { readFile, mkdir, writeFile } from "fs/promises";
import { join } from "path";

type GoldenItem<TInput> = {
    input: TInput;
    testName: string;
};

export function runGoldenTests<TInput>(
    dir: string, filename: string, goldenItems: GoldenItem<TInput>[],
    handler: (input: TInput) => Promise<any>,
) {
    const folderUnderscore = filename.split("/").pop()!.split(".")[0].replace(/ /g, "_");
    const isGoldenUpdate = process.env.GOLDEN_UPDATE === "1";
    for (const item of goldenItems) {
        const filename = `${item.testName.replace(/ /g, "_")}.golden`;
        it(item.testName, async () => {
            // Read the golden file.
            let file = "";
            try {
                file = await readFile(
                    join(dir, "tests", "data", folderUnderscore, filename), "utf8");
            } catch {
                if (!isGoldenUpdate) {
                    throw new Error(
                        `Golden file ${filename} not found. Set GOLDEN_UPDATE=1 to update it.`,
                    );
                }
            }

            // Call the handler.
            const res = await handler(item.input);
            const json = JSON.stringify(res, null, 4) + "\n";

            if (isGoldenUpdate) {
                // Update the golden file.

                await mkdir(
                    join(dir, "tests", "data", folderUnderscore),
                    { recursive: true },
                );
                await writeFile(
                    join(dir, "tests", "data", folderUnderscore, filename), json,
                );
            } else {
                // Verify the golden file.
                expect(file).toBe(json);
            }
        });
    }
}
