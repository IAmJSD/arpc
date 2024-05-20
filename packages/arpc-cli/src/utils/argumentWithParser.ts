import { Argument } from "commander";

export function argumentWithParser<T>(name: string, description: string, parser: (value: string) => T) {
    return new Argument(name, description).argParser(parser);
}
