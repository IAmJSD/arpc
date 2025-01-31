import type { Client, Method, Methods } from "@arpc-packages/client-gen";
import { sanitize } from "./utils";
import titleRenderer from "./titleRenderer";
import typeRenderer from "./typeRenderer";

function renderMethod(chunks: string[], method: Method, methodName: string, prefix: string, apiVersion: string) {
    chunks.push(titleRenderer(`${prefix}${methodName}`, 3, false, apiVersion));
    if (method.description) {
        chunks.push(/* html */`<p>${sanitize(method.description)}</p>`);
    }
    if (method.input) {
        chunks.push(/* html */`<p><span class="font-bold">Input:</span> ${sanitize(method.input.name)} (${sanitize(typeRenderer(method.input.signature))})</p>`);
    }
    chunks.push(/* html */`<p><span class="font-bold">Output:</span> ${sanitize(typeRenderer(method.output))}</p>`);
}

function renderMethods(chunks: string[], methods: Methods, prefix: string, apiVersion: string) {
    const methodsIter = Object.entries(methods);
    methodsIter.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    for (const [methodName, method] of methodsIter) {
        if (typeof method.mutation === "boolean") {
            // Render a singular method.
            renderMethod(chunks, method as Method, methodName, prefix, apiVersion);
        } else {
            // Render with this as a prefix.
            renderMethods(chunks, method as Methods, `${prefix}${methodName}.`, apiVersion);
        }
    }
}

export default (client: Client) => {
    const chunks: string[] = [];

    chunks.push(titleRenderer(`API ${client.apiVersion.toUpperCase()}`, 2, false, client.apiVersion));

    chunks.push(/* html */`<p>${client.description ? sanitize(client.description) : "This is the documentation for the API:"}</p>`);

    chunks.push(/* html */`<div class="ml-4">`);
    renderMethods(chunks, client.methods, "", client.apiVersion);
    chunks.push(/* html */`</div>`);

    return chunks.join("");
};
