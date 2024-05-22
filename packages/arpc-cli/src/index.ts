#!/usr/bin/env node

import { Command } from "commander";
import { version } from "../package.json";
import * as commands from "./commands";

const program = new Command();

program
    .name("arpc")
    .description("The tool to manage and setup arpc services.")
    .version(version);

for (const [key, value] of Object.entries(commands)) {
    value(program.command(key));
}

program.parseAsync().catch((error) => {
    console.error(error);
    process.exit(1);
});
