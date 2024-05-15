import { readFile } from "fs/promises";
import { join } from "path";
import { parse } from "@arpc/lockfile";
import type {
    BuildData, Client, Enum, Exception, Method, Methods, Object,
} from "@arpc/client-gen";
import type { RPCRouter } from "@arpc/core";
import {
    SourceFile, createProgram, getLeadingCommentRanges, isArrowFunction,
    isClassDeclaration, isEnumDeclaration, isFunctionExpression,
    isMethodDeclaration, isStringLiteral, isTypeAliasDeclaration,
    isVariableStatement, Symbol, SignatureKind, isFunctionDeclaration,
} from "typescript";
import z from "zod";
import { builtinExceptions } from "./builtinExceptions";
import { getZodInputSignature } from "./getZodInputSignature";
import { dequotify } from "./helpers";
import { processTypeScriptReturnType } from "./processTypeScriptReturnType";

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
export async function generateSchema(
    protocol: string, hostname: string, router: RPCRouter<any, any, any, any, any, any>,
): Promise<BuildData> {
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

    // Defines a super slim partial of what a routers routes look like.
    type RoutesRoutesPartial = {
        [key: string]: {
            schema: z.ZodType<any, any, any>;
            mutation?: boolean;
        } | RoutesRoutesPartial;
    };

    // Get the routes from the router so we can access the compiled data.
    // @ts-expect-error: We are accessing a private property.
    const routerRoutes: {[apiVersion: string]: RoutesRoutesPartial} = router._routes;

    // Defines where the enums and objects will be stored. The set is used to avoid duplicate names.
    const enums: Enum[] = [];
    const objects: Object[] = [];
    const uniqueNames = new Set<string>();

    // Handle creating a method and setting any enums/objects.
    const typeChecker = tsProgram.getTypeChecker();
    function createMethod(src: SourceFile, path: string[], version: string): Method {
        // Find the route in the current router.
        let currentPathItem = (routerRoutes || {})[version];
        let schema: z.ZodType<any, any, any> | null = null;
        let mutation: boolean | undefined = undefined;
        let pathIndex = 0;
        while (currentPathItem) {            
            // Get the next path item.
            const nextItem = currentPathItem[path[pathIndex]];

            // If this contains a Zod schema, we are at the end of the path.
            if (nextItem.schema && nextItem.schema instanceof z.ZodType) {
                schema = nextItem.schema;
                mutation = nextItem.mutation as boolean;
                break;
            }

            // Move to the next path item.
            currentPathItem = nextItem as RoutesRoutesPartial;
            pathIndex++;
        }
        if (!schema) {
            throw new Error("Lockfile and router routes are out of sync");
        }

        // Get all of the type alias declarations in the file.
        const typeAliases: Map<string, string> = new Map();
        src.forEachChild((node) => {
            if (isTypeAliasDeclaration(node)) {
                typeAliases.set(node.name.text, node.type.getText());
            }
        });

        // Recurse the type aliases to their basest form.
        for (let [key, value] of typeAliases) {
            while (typeAliases.has(value)) {
                value = typeAliases.get(value)!;
            }
            typeAliases.set(key, value);
        }

        // Find the method.
        const method = src.forEachChild((node) => {
            if (isVariableStatement(node)) {
                // Get the declaration list.
                const declList = node.declarationList.declarations;

                // Arrow functions will only have one declaration.
                if (declList.length !== 1) {
                    return;
                }
                const decl = declList[0];

                // Check the name.
                if (decl.name.getText() === "method") {
                    // Check the initializer is a function.
                    if (
                        decl.initializer &&
                        (
                            isArrowFunction(decl.initializer) ||
                            isFunctionExpression(decl.initializer)
                        )    
                    ) {
                        return decl.initializer;
                    }

                    // Throw an error if it isn't.
                    throw new Error("method must be an arrow function or function expression");
                }
            }

            // Handle classic methods.
            if ((isMethodDeclaration(node) || isFunctionDeclaration(node)) && node.name?.getText() === "method") {
                return node;
            }
        });
        if (!method) {
            throw new Error("Failed to find method");
        }

        // Get the first argument.
        const arg = method.parameters[0];
        if (!arg) {
            throw new Error("Method must have at least one argument");
        }

        // Check the type is a type reference or a type literal that equals
        // z.infer<typeof schema>.
        let inputTypeName: string | null = null;
        if (arg.type) {
            // Not having a type is bizarre, but technically allowed, so we'll permit it too :)

            const typeText = arg.type.getText();
            if (typeText !== "z.infer<typeof schema>") {
                const t = typeAliases.get(typeText);
                if (t !== "z.infer<typeof schema>") {
                    throw new Error(`Method argument must be of type or alias a type that is equal to z.infer<typeof schema> in the same file, got ${typeText}`);
                }
                inputTypeName = typeText;
            }
        }

        // Process the Zod schema to get the input type.
        const input = {
            name: arg.name.getText(),
            signature: getZodInputSignature(
                schema, enums, objects, uniqueNames, () => inputTypeName || (path.map(
                    (x) => x[0].toUpperCase() + x.slice(1)).join("") + "Opts"),
            ),
        };

        // Process the output type by using the TS return type (either inferred or explicitly set).
        // @ts-ignore: For some reason, this isn't exported?
        const methodSym: Map<string, Symbol> = src.locals;
        let sym = methodSym.get("method")!;
        // @ts-ignore: idk why this is a error.
        if (sym.exportSymbol) sym = sym.exportSymbol;
        const symType = typeChecker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration!);
        const signatures = typeChecker.getSignaturesOfType(symType, SignatureKind.Call);
        const lastSignature = signatures[signatures.length - 1];
        const returnType = typeChecker.getReturnTypeOfSignature(lastSignature);

        // Get the output type.
        const output = processTypeScriptReturnType(
            returnType, typeChecker, enums, objects, uniqueNames, typeAliases, path,
        );

        // Get the description from the comment above the method.
        let description: string | null = null;
        const fullStart = method.getFullStart();
        const start = method.getStart();
        if (fullStart !== start) {
            const ft = src.getFullText();
            const comments = getLeadingCommentRanges(ft, start);
            if (comments) {
                description = ft.substring(comments[0].pos, comments[0].end).trim();
            }
        }

        // Default mutation to true if it is undefined.
        if (mutation === undefined) {
            mutation = true;
        }

        // Return the method.
        return { input, output, description, mutation };
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
                methods[key] = createMethod(parsed, stack, version);
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
