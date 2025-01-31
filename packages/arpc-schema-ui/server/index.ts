import type { BuildData } from "@arpc-packages/client-gen";
import baseHtml from "./baseHtml";
import titleRenderer from "./titleRenderer";
import objectRenderer from "./objectRenderer";
import enumRenderer from "./enumRenderer";
import clientRenderer from "./clientRenderer";
import { sanitize } from "./utils";

function generateHtmlForBuildData(buildData: BuildData, selectedVersion: string) {
    const chunks: string[] = [];

    if (buildData.objects.length > 0) {
        chunks.push(titleRenderer("Objects", 2, true));
        chunks.push(/* html */`<p>These are the objects in this API:</p><div class="ml-4">`);
        for (const object of buildData.objects) {
            chunks.push(objectRenderer(object));
        }
        chunks.push(/* html */`</div>`);
    }

    if (buildData.enums.length > 0) {
        chunks.push(titleRenderer("Enums", 2, true));
        chunks.push(/* html */`<p>These are the enums in this API:</p><div class="ml-4">`);
        for (const enum_ of buildData.enums) {
            chunks.push(enumRenderer(enum_));
        }
        chunks.push(/* html */`</div>`);
    }

    chunks.push(titleRenderer("Exceptions", 2, true));
    chunks.push(/* html */`<p class="mb-2">The following exceptions are built into arpc:</p>
<ul class="list-disc list-inside">`);
    for (const exception of buildData.builtinExceptions) {
        chunks.push(/* html */`<li><code>${sanitize(exception.name)}</code>: ${sanitize(exception.description)}</li>`);
    }
    chunks.push(/* html */`</ul>`);
    if (buildData.customExceptions.length > 0) {
        chunks.push(/* html */`<p class="mb-2">The following exceptions are defined by the API:</p>
<ul class="list-disc list-inside">`);
        for (const exception of buildData.customExceptions) {
            chunks.push(/* html */`<li><code>${sanitize(exception.name)}</code>: ${sanitize(exception.description)}</li>`);
        }
        chunks.push(/* html */`</ul>`);
    }

    for (const client of buildData.clients) {
        chunks.push(/* html */`<section id="_arpc_version_${client.apiVersion}"${selectedVersion === client.apiVersion ? "" : ` class="hidden"`}>
    ${clientRenderer(client)}
</section>`);
    }

    return chunks.join("");
}

export function render(title: string, description: string, buildData: BuildData) {
    function generateDynamicHtml(selectedVersion: string) {
        const client = buildData.clients.find((client) => client.apiVersion === selectedVersion);
        if (!client) throw new Error(`Internal error: Client not found for version ${selectedVersion}`);

        return /* html */`${generateHtmlForBuildData(buildData, selectedVersion)}
<div id="arpc_schema" class="hidden">${JSON.stringify(buildData)}</div>`;
    }

    return baseHtml(title, description, buildData.clients.map((client) => client.apiVersion), generateDynamicHtml);
}
