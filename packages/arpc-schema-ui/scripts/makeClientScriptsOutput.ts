import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const blockingFile = readFileSync(join(__dirname, "..", "dist", "client-inline-blocking.js"), "utf-8");

const jsonOut = join(__dirname, "..", "dist", "client-scripts-output.json");
writeFileSync(jsonOut, JSON.stringify({ blocking: blockingFile }));
