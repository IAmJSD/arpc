import { readFile } from "fs/promises";
import { join } from "path";
import { parse } from "@arpc/lockfile";
import type {
    BuildData, Client, Enum, Exception, Method, Methods, Object,
} from "@arpc/client-gen";
import {
    SourceFile, createProgram, getLeadingCommentRanges, isClassDeclaration,
    isEnumDeclaration, isStringLiteral, isVariableStatement,
} from "typescript";
import { builtinExceptions } from "./builtinExceptions";

type AuthenticationType = {
    tokenTypes: { [humanName: string]: string };
    defaultTokenType?: string;
};

type Routes = { [key: string]: string | Routes };

function importBulk(routes: Routes, imported: Set<string>) {
    for (const route of Object.values(routes)) {
        if (typeof route !== "string") {
            importBulk(route, imported);
            continue;
        }
        if (imported.has(route)) {
            continue;
        }
        imported.add(route);
    }
}

const QUOTES_RE = /^(["'`])(.*)\1$/;

function dequotify(value: string): string {
    const match = QUOTES_RE.exec(value);
    if (!match) {
        return value;
    }

    return match[2];
}

const TOKEN_TYPES_REGEX = /^TokenTypes\.([A-Za-z0-9_]+)$/;

// Makes sure this is a token type.
function isTokenType(value: string | undefined): string | undefined {
    if (value === "undefined") return undefined;
    const match = TOKEN_TYPES_REGEX.exec(value || "");
    if (!match) {
        throw new Error(`Invalid token type: ${value}`);
    }

    return match[1];
}

// Generates a schema using the TypeScript processor and the files on disk. Note that this is VERY
// slow and partially blocking, so should only be ran during page build in production.
export async function generateSchema(protocol: string, hostname: string): Promise<BuildData> {
    // Get the lockfile.
    const base = join(process.cwd(), "rpc");
    const lockfile = parse(await readFile(join(base, "index.ts"), "utf-8"));

    // Defines the TS program.
    const files = [
        join(base, "index.ts"),
    ];
    if (lockfile.hasAuthentication) {
        files.push(join(base, "authentication.ts"));
    }
    if (lockfile.hasRatelimiting) {
        files.push(join(base, "ratelimiting.ts"));
    }
    const imported = new Set<string>();
    importBulk(lockfile.routes, imported);
    importBulk(lockfile.exceptions, imported);
    for (const route of imported) {
        files.push(join(base, route));
    }
    const tsProgram = createProgram(files, {
        allowJs: true,
        alwaysStrict: false,
    });

    // Handle authentication.
    let authentication: AuthenticationType | null = null;
    if (lockfile.hasAuthentication) {
        // Parse rpc/authentication.ts.
        const parsed = tsProgram.getSourceFile(join(base, "authentication.ts"));
        if (!parsed) {
            throw new Error("Failed to parse rpc/authentication.ts");
        }

        // Find the authentication information we need for static analysis.
        let tokenTypes: { [humanName: string]: string } | null = null;
        let defaultTokenType: string | undefined | null = null;
        authentication = parsed.forEachChild((node) => {
            // Handle the token types array.
            if (isEnumDeclaration(node) && node.name.text === "TokenTypes") {
                tokenTypes = {};
                for (const member of node.members) {
                    const title = dequotify(member.name.getText());

                    // Check the initializer is a string literal.
                    if (!member.initializer || !isStringLiteral(member.initializer)) {
                        throw new Error(`TokenTypes.${title} must be a string literal`);
                    }
                    tokenTypes[title] = dequotify(member.initializer.getText());
                }

                if (defaultTokenType !== null) {
                    return { tokenTypes, defaultTokenType };
                }
                return;
            }

            // Handle the default token type.
            if (isVariableStatement(node)) {
                const declList = node.declarationList.declarations;
                if (declList.length === 1) {
                    const decl = declList[0];
                    if (decl.name.getText() === "defaultTokenType") {
                        defaultTokenType = isTokenType(decl.initializer?.getText());
                        if (tokenTypes) {
                            return { tokenTypes, defaultTokenType };
                        }
                    }
                }
            }
        }) || null;

        if (tokenTypes) {
            // Handle if the default token type is not set. This should be a single member object.
            if (!authentication) authentication = { tokenTypes };
        } else {
            // If this isn't set, we failed to parse the authentication file.
            throw new Error("Failed to find TokenTypes enum in rpc/authentication.ts");
        }
    }

    // Handle exceptions.
    const exceptions: Exception[] = [];
    const keys = Object.keys(lockfile.exceptions).sort();
    for (const exceptionName of keys) {
        // Get the file path for the exception file.
        const fp = join(base, lockfile.exceptions[exceptionName]);

        // Parse the exception file.
        const parsed = tsProgram.getSourceFile(fp);
        if (!parsed) {
            throw new Error(`Failed to parse ${fp}`);
        }

        // Find the class export for the exception.
        const cls = parsed.forEachChild((node) => {
            if (isClassDeclaration(node) && node.name?.text === exceptionName) {
                return node;
            }
        });
        if (!cls) {
            throw new Error(`Failed to find class ${exceptionName} in ${fp}`);
        }

        // Get any comment above the exception.
        let description: string | null = null;
        const fullStart = cls.getFullStart();
        const start = cls.getStart();
        if (fullStart !== start) {
            const ft = parsed.getFullText();
            const comments = getLeadingCommentRanges(ft, start);
            if (comments) {
                description = ft.substring(comments[0].pos, comments[0].end).trim();
            }
        }
        exceptions.push({ name: exceptionName, description: description || `A ${exceptionName} custom exception` });
    }

    // Defines where the enums and objects will be stored. The set is used to avoid duplicate names.
    const enums: Enum[] = [];
    const objects: Object[] = [];
    const uniqueNames = new Set<string>();

    // Handle creating a method and setting any enums/objects.
    function createMethod(src: SourceFile, path: string[]): Method {
        
    }

    // Handle going through the API versions and building clients for them.
    const apiVersions = Object.keys(lockfile.routes).sort();
    const clients: Client[] = [];
    for (const version of apiVersions) {
        // Get the description from rpc/descriptions/<version>.md if it exists.
        let description: string | null = null;
        try {
            description = await readFile(join(base, "descriptions", `${version}.md`), "utf-8");
        } catch {
            // Ignore this error.
        }
        if (description === "You can write markdown here to describe your API version.\n") {
            description = null;
        }

        // Get the routes from the lockfile.
        const routes = lockfile.routes[version] as Routes;

        // Defines the methods.
        const methods: Methods = {};

        // Pre-push the client.
        clients.push({
            apiVersion: version as `v${string}`,
            methods, description, defaultProtocol: protocol,
            defaultHostname: hostname, authentication,
        });

        // Handle going through the routes and mapping out the method objects.
        function buildMethods(routes: Routes, methods: Methods, stack: string[]) {
            for (const [key, route] of Object.entries(routes)) {
                if (typeof route !== "string") {
                    // Recurse into the object.
                    const obj: Methods = {};
                    methods[key] = obj;
                    stack.push(key);
                    buildMethods(route, obj, stack);
                    stack.pop();
                    continue;
                }

                // Parse the file.
                const fp = join(base, route + ".ts");
                const parsed = tsProgram.getSourceFile(fp);
                if (!parsed) {
                    throw new Error(`Failed to parse ${fp}`);
                }

                // Create the method.
                stack.push(key);
                methods[key] = createMethod(parsed, stack);
                stack.pop();
            }
        }
        buildMethods(routes, methods, []);
    }

    // Return the build data.
    return {
        enums, objects, builtinExceptions,
        customExceptions: exceptions, clients,
    };
}
