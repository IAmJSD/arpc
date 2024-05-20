import { header, authImport, rateLimitImport } from "./globals";
import { Lockfile, Routes } from "./Lockfile";

// Defines the route import line.
const routeImportRegex = /^import \* as (.+) from "(\.\/routes\/.+)";$/;

// Defines the exception or object import line.
const objectImportRegex = /^import { (.+) } from "(.+)";$/;

// Defines the single object line.
const singleObjectRegex = /^[ \t]+(.+),$/;

function parseSingleLevelObject(
    name: string, line: string, lines: string[], imports: Map<string, string>,
) {
    if (line === `const ${name} = {} as const;`) {
        // Return an empty object.
        return {};
    }

    if (line !== `const ${name} = {`) {
        // Return null since this is not a single level object.
        return null;
    }

    const obj: Record<string, string> = {};
    for (; line !== "} as const;"; line = lines.shift()!) {
        if (!line) {
            throw new Error(`The object ${name} is missing a closing bracket.`);
        }

        const res = singleObjectRegex.exec(line);
        if (res) {
            // Parse the object.
            const [_, key] = res;
            const type = imports.get(key);
            if (!type) {
                throw new Error(`The import for ${key} is missing.`);
            }
            obj[key] = type;
        }
    }
    return obj;
}

const NEW_OBJ_REGEX = /^[ \t]+(.+): {$/;
const BLANK_OBJ_REGEX = /^[ \t]+(.+): {},$/;
const CLOSING_OBJ_REGEX = /^[ \t]+},$/;
const VALUE_REGEX = /^[ \t]+(.+): (.+),$/;

function parseRoutes(
    line: string, lines: string[], imports: Map<string, string>,
) {
    if (line === "const routes = {} as const;") {
        // Return an empty object.
        return {};
    }

    if (line !== "const routes = {") {
        // Return null since this is not a routes object.
        return null;
    }

    // Defines the stack of objects.
    const objStack: Routes[] = [{}];
    for (const line of lines) {
        // Check if this is the end of the object.
        if (line === "} as const;") {
            if (objStack.length !== 1) {
                throw new Error(`The routes are missing ${objStack.length - 1} closing brackets.`);
            }
            return objStack[0];
        }

        // Look for the start of a object.
        let blank = false;
        let res = NEW_OBJ_REGEX.exec(line);
        if (!res) {
            // Try to match a blank object.
            res = BLANK_OBJ_REGEX.exec(line);
            blank = true;
        }
        if (res) {
            // Create a new object.
            const obj: Routes = {};
            objStack[objStack.length - 1][res[1]] = obj;
            if (!blank) objStack.push(obj);
            continue;
        }

        // Look for a value inside the object.
        res = VALUE_REGEX.exec(line);
        if (res) {
            // Parse the value.
            let [_, key, type] = res;
            if (key.startsWith('"')) key = key.substring(1, key.length - 1);
            const t = imports.get(type);
            if (!t) {
                throw new Error(`The import for ${type} is missing.`);
            }
            objStack[objStack.length - 1][key] = t;
            continue;
        }

        // Look for the end of a object.
        res = CLOSING_OBJ_REGEX.exec(line);
        if (res) {
            // Close the object.
            objStack.pop();
            if (objStack.length === 0) {
                throw new Error("The routes are missing a closing bracket.");
            }
            continue;
        }
    }
    throw new Error("The routes are missing a closing bracket.");
}

export function parse(lockFile: string): Lockfile {
    // Find the lockfile header.
    if (lockFile.startsWith(header)) {
        lockFile = lockFile.substring(header.length);
    } else {
        throw new Error("The lockfile header is missing.");
    }

    // Split the lockfile into lines.
    const lines = lockFile.split("\n");
    let line = lines.shift();
    let hasAuth = false;
    let hasRatelimits = false;
    const imports = new Map<string, string>();
    let exceptions: Record<string, string> | null = {};
    while (line !== undefined) {
        if (line === "") {
            // Skip empty lines.
            line = lines.shift();
            continue;
        }

        if (line === authImport) {
            // Set the authentication flag.
            hasAuth = true;
            line = lines.shift();
            continue;
        }

        if (line === rateLimitImport) {
            // Set the rate limit flag.
            hasRatelimits = true;
            line = lines.shift();
            continue;
        }

        let res = routeImportRegex.exec(line) || objectImportRegex.exec(line);
        if (res) {
            // Add the import.
            imports.set(res[1], res[2]);
            line = lines.shift();
            continue;
        }

        // Handle exceptions and objects.
        let x = parseSingleLevelObject(
            "exceptions", line, lines, imports,
        );
        if (x) {
            // Set the exceptions.
            exceptions = x;
            line = lines.shift();
            continue;
        }

        // Handle routes.
        const routes = parseRoutes(line, lines, imports);
        if (routes) {
            return {
                hasAuthentication: hasAuth,
                hasRatelimiting: hasRatelimits,
                exceptions: exceptions || {},
                routes,
            };
        }
    }
    throw new Error("The lockfile is missing the routes.");
}
