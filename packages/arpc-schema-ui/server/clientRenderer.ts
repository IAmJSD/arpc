import type { Client, Method, Methods } from "@arpc-packages/client-gen";
import { sanitize } from "./utils";
import titleRenderer from "./titleRenderer";
import typeRenderer from "./typeRenderer";

function renderMethod(chunks: string[], method: Method, methodName: string, prefix: string) {
    chunks.push(titleRenderer(`${prefix}${methodName}`, 3));
    if (method.description) {
        chunks.push(/* html */`<p>${sanitize(method.description)}</p>`);
    }
    if (method.input) {
        chunks.push(/* html */`<p><span class="font-bold">Input:</span> ${sanitize(method.input.name)} (${sanitize(typeRenderer(method.input.signature))})</p>`);
    }
    chunks.push(/* html */`<p><span class="font-bold">Output:</span> ${sanitize(typeRenderer(method.output))}</p>`);
}

function renderMethods(chunks: string[], methods: Methods, prefix: string) {
    const methodsIter = Object.entries(methods);
    methodsIter.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    for (const [methodName, method] of methodsIter) {
        if (typeof methods.mutation === "boolean") {
            // Render a singular method.
            renderMethod(chunks, method as Method, methodName, prefix);
        } else {
            // Render with this as a prefix.
            renderMethods(chunks, method as Methods, `${prefix}${methodName}.`);
        }
    }
}

export default (client: Client) => {
    const chunks: string[] = [];

    if (client.description) {
        chunks.push(/* html */`<p>${sanitize(client.description)}</p>`);
    }

    renderMethods(chunks, client.methods, "");

    return chunks.join("");
};
