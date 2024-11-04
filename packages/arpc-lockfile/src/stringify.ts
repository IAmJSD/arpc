import { Lockfile, Routes } from "./Lockfile";
import { authImport, header, rateLimitImport } from "./globals";

function generateSingleLevelObject(name: string, keys: string[]): string {
    if (keys.length === 0) {
        return `const ${name} = {} as const;\n\n`;
    }

    let body = `const ${name} = {\n`;
    for (const key of keys) {
        body += `    ${key},\n`;
    }
    body += `} as const;\n\n`;
    return body;
}

function camel(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function importRoutes(routes: Routes, imports: Map<string, string>, stack?: string): string {
    let body = "";

    const keys = Object.keys(routes).sort();
    for (const key of keys) {
        const value = routes[key];
        if (typeof value === "string") {
            const hasImport = imports.has(value);
            if (!hasImport) {
                body += `import * as ${stack}${camel(key)} from "${value}";\n`;
                imports.set(value, `${stack}${camel(key)}`);
            }
        } else {
            const newStack = stack ? `${stack}${camel(key)}` : key;
            body += importRoutes(value, imports, newStack);
        }
    }

    if (!stack && body !== "") body += "\n";
    return body;
}

function generateRoutes(routes: Routes, imports: Map<string, string>, spaces?: number): string {
    let body: string;
    const keys = Object.keys(routes).sort();
    let init = false;
    if (spaces) {
        if (keys.length === 0) {
            return "},\n";
        }
        body = "\n";
    } else {
        spaces = 4;
        if (keys.length === 0) {
            return "const routes = {} as const;\n\n";
        }
        body = "const routes = {\n";
        init = true;
    }

    let indentation = " ".repeat(spaces);
    for (const key of keys) {
        const value = routes[key];
        if (typeof value === "string") {
            body += `${indentation}${key}: ${imports.get(value)},\n`;
        } else {
            body += `${indentation}${key}: {`;
            body += generateRoutes(value, imports, spaces + 4);
        }
    }
    if (init) {
        body += "} as const;\n\n";
    } else {
        body += `${" ".repeat(spaces - 4)}},\n`;
    }
    return body;
}

export function stringify(lockfile: Lockfile): string {
    // Defines the body.
    let body = `${header}
import { router } from "@arpc-packages/core";

`;

    // Import authentication and rate limiting if needed.
    let hasContent = false;
    if (lockfile.hasAuthentication) {
        body += authImport + "\n";
        hasContent = true;
    }
    if (lockfile.hasRatelimiting) {
        body += rateLimitImport + "\n";
        hasContent = true;
    }
    if (hasContent) {
        body += "\n";
        hasContent = false;
    }

    // Import the exceptions.
    for (const [name, path] of Object.entries(lockfile.exceptions)) {
        body += `import { ${name} } from "${path}";\n`;
        hasContent = true;
    }
    if (hasContent) {
        body += "\n";
        hasContent = false;
    }

    // Import the routes.
    const routeImports = new Map<string, string>();
    body += importRoutes(lockfile.routes, routeImports);

    // Build the objects.
    body += generateSingleLevelObject("exceptions", Object.keys(lockfile.exceptions).sort());
    body += generateRoutes(lockfile.routes, routeImports);

    // Handle building the router.
    const routerArray = [
        "const routerInstance = router().",
        "    setExceptions(exceptions).",
    ];
    if (lockfile.hasAuthentication) {
        routerArray.push("    setAuthHandler(authentication).");
    }
    if (lockfile.hasRatelimiting) {
        routerArray.push("    setRateLimiting(ratelimiting).");
    }
    routerArray.push(`    setRoutes(routes);

export const httpHandler = routerInstance.buildHttpHandler();

export const self = routerInstance.self;

/** NOTE: This is VERY slow. Only run this in dev or in the building of production. */
export const generateSchema = async () => {
    const genImport = await import("@arpc-packages/schema-gen");
    return genImport.generateSchema(routerInstance);
};
`);

    // Return the body.
    return body + routerArray.join("\n");
}
