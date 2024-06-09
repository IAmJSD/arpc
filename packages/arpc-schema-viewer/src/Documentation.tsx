"use client";

import type {
    BuildData, Client, Method, Methods, Object, Signature,
} from "@arpc-packages/client-gen";
import { Article } from "./components/Article";
import { Divider } from "./components/Divider";
import { useClient } from "./components/VersionSwitcher";
import { createTitle, slugify } from "./components/createTitle";

type NotNull<T> = T extends null ? never : T;

function AuthenticationDocs({ authentication }: {
    authentication: NotNull<Client["authentication"]>;
}) {
    const typeKeys = Object.keys(authentication.tokenTypes).sort();
    return (
        <>
            <p>
                This API client has authentication which may be required depending on the method.
            </p>
            {
                (typeKeys.length !== 1 || !authentication.defaultTokenType) && (
                    <>
                        <p>
                            The following authentication types are available:
                        </p>
                        <ul>
                            {
                                typeKeys.map((key) => {
                                    const tokenType = authentication.tokenTypes[key];
                                    return (
                                        <li key={key}>
                                            <code>{key}</code>: Sends the token type <code>{tokenType}</code>.
                                        </li>
                                    );
                                })
                            }
                        </ul>
                    </>
                )
            }
            {
                authentication.defaultTokenType ?
                    <p>
                        The default authentication type is <code>{authentication.defaultTokenType}</code>.
                    </p> :
                    <p>
                        No default authentication type is set so you must set that with the token if you intend to authenticate.
                    </p>
            }
        </>
    );
}

type Props = {
    buildData: BuildData;
};

function ExceptionsDocs({ buildData }: Props) {
    return (
        <>
            <p className="mb-2">This API client has the following exceptions related to the request handling:</p>
            {
                buildData.builtinExceptions.map((exception) => {
                    return (
                        <p key={exception.name}>
                            <code>{exception.name}:</code> {exception.description || "No description."}
                        </p>
                    );
                })
            }
            {
                buildData.customExceptions.length !== 0 && (
                    <>
                        <p className="my-2">Additionally, this API client has the following custom exceptions:</p>
                        {
                            buildData.customExceptions.map((exception) => {
                                return (
                                    <p key={exception.name}>
                                        <code>{exception.name}:</code> {exception.description || "No description."}
                                    </p>
                                );
                            })
                        }
                    </>
                )
            }
        </>
    );
}

function nullSig(signature: Signature) {
    // Remove the rest of the nullables.
    while (signature.type === "nullable") signature = signature.inner;

    // Return the signature.
    return (
        <>
            <SignatureRenderer signature={signature} />?
        </>
    );
}

function SignatureRenderer({ signature }: { signature: Signature }) {
    switch (signature.type) {
    case "string":
        return "string";
    case "boolean":
        return "boolean";
    case "bigint":
        return "bigint";
    case "number":
        return "number";
    case "object":
        return (
            <a href={"#" + slugify(signature.key)}>{signature.key}</a>
        );
    case "nullable":
        return nullSig(signature);
    case "array":
        return (
            <>
                <SignatureRenderer signature={signature} />[]
            </>
        );
    case "literal":
        return typeof signature.value === "bigint" ?
            signature.value.toString() :
            JSON.stringify(signature.value);
    case "map":
        return (
            <>
                map[<SignatureRenderer signature={signature.key} />]
                <SignatureRenderer signature={signature.value} />
            </>
        );
    case "union":
        return signature.inner.map(
            (s, i) => <SignatureRenderer signature={s} key={i} />,
        ).join(" | ");
    case "enum_key":
    case "enum_value":
        return (
            <>
                {signature.type.substring(5)} of {signature.enum}
            </>
        );
    default:
        throw new Error("unknown signature type");
    }
}

function ObjectDocs({ object }: { object: Object }) {
    const keys = Object.keys(object.fields).sort();

    if (keys.length === 0) {
        return <div>This object does not have any attributes.</div>;
    }

    return (
        <>
            <p>This object has the following attributes:</p>
            <ul>
                {
                    keys.map((key) => {
                        const field = object.fields[key];
                        return (
                            <li key={key}>
                                <code>{key}</code>:{" "}
                                <SignatureRenderer signature={field} />
                            </li>
                        );
                    })
                }
            </ul>
        </>
    );
}

function MethodDocs({ method }: { method: Method }) {
    return (
        <>
            {method.description && <p>{method.description}</p>}
            {
                method.input && <p>
                    <span className="font-bold">Input: </span>
                    {method.input.name} (<SignatureRenderer signature={method.input.signature} />)
                </p>
            }
            <p>
                <span className="font-bold">Output: </span>
                <SignatureRenderer signature={method.output} />
            </p>
        </>
    );
}

const CategoryDivider = () => (
    <div className="my-6">
        <Divider />
    </div>
);

function mapMethods<T>(
    methods: Methods,
    callback: (namespace: string, method: Method) => T,
    namespacePrefix?: string,
) {
    const result: T[] = [];
    if (!namespacePrefix) namespacePrefix = "";
    const keys = Object.keys(methods).sort();
    for (const key of keys) {
        const methodOrMethods = methods[key];
        if (typeof methodOrMethods.mutation === "boolean") {
            // Call the callback since this is a method.
            result.push(callback(namespacePrefix + key, methodOrMethods as Method));
        } else {
            // Recursively call this function since this is a group.
            const m = mapMethods(methodOrMethods as Methods, callback, namespacePrefix + key + ".");
            result.push(...m);
        }
    }
    return result;
}

export function Documentation({ buildData }: Props) {
    // Grab the selected API client.
    const client = useClient(buildData);

    // If there's no client, return early.
    if (!client) return <div>No API versions found.</div>;

    // Return the main layout.
    return (
        <Article>
            {
                client.authentication && <>
                    {createTitle("heading", "Authentication")}
                    <AuthenticationDocs authentication={client.authentication} />
                    <CategoryDivider />
                </>
            }

            {createTitle("heading", "Exceptions")}
            <ExceptionsDocs buildData={buildData} />
            <CategoryDivider />

            {createTitle("heading", "Objects")}
            {
                buildData.objects.length === 0 ?
                    <p>This API client exposes no objects.</p> :
                    <>
                        <p>This API client exposes the following objects:</p>
                        {buildData.objects.map((object) => {
                            return (
                                <div key={object.name}>
                                    {createTitle("subheading", object.name)}
                                    <ObjectDocs object={object} />
                                </div>
                            );
                        })}
                    </>
            }
            <CategoryDivider />

            {createTitle("heading", "Methods")}
            {
                Object.keys(client.methods).length === 0 ?
                    <p>This API client exposes no methods.</p> :
                    <>
                        <p>This API client exposes the following methods:</p>
                        {mapMethods(client.methods, (ns, method) => (
                            <div key={ns}>
                                {createTitle("subheading", ns)}
                                <MethodDocs method={method} />
                            </div>
                        ))}
                    </>
            }
        </Article>
    );
}
