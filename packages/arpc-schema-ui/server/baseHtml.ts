import { sanitize } from "./utils";
import Semver from "./Semver";
import { blocking } from "../dist/client-scripts-output.json";
// @ts-ignore: A bit of a special case.
import * as stylesCss from "bundle-text:../styles.css";

function sortVersions(versions: string[], versionTypeS: Set<boolean>) {
    return versions.map((version) => new Semver(version)).sort((a, b) => a.compare(b, (t) => {
        versionTypeS.add(t !== null);
    })).map((semver) => semver.toString()).reverse();
}

function renderSelector(versions: string[], renderCheckbox: boolean) {
    return /* html */`<form onsubmit="event.preventDefault();">
    <label for="_arpc_api_version_selector">API Version:</label>
    <select name="version" id="_arpc_api_version_selector" class="dark:text-white dark:bg-black">
        ${versions.map((version) => /* html */`<option value="${version}">${version}</option>`).join("")}
    </select>
    ${renderCheckbox ? /* html */`<label for="_arpc_stable_versions_only">Only show stable versions</label>
<input type="checkbox" name="stable_only" id="_arpc_stable_versions_only" />` : ""}
</form>`;
}

export default (title: string, description: string, versions: string[], htmlContent: (version: string) => string) => {
    // Get the santized title and description.
    const titleS = sanitize(title);
    const descriptionS = sanitize(description);

    // Get the version type and sort the versions.
    const versionTypeS = new Set<boolean>();
    versions = sortVersions(versions, versionTypeS);

    // Return the html as a string.
    return /* html */`<!DOCTYPE HTML>
<html lang="en">
    <head>
        <title>${titleS}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="${descriptionS}">
        <meta property="og:title" content="${titleS}">
        <meta property="og:type" content="website">
    </head>

    <body class="dark:text-white dark:bg-black">
        <style>${stylesCss}</style>
        <div id="_arpc_root_container" class="max-w-6xl mx-auto p-4">
            <header class="py-4 border-b-2 border-black dark:border-white">
                <div class="flex justify-between gap-4 flex-wrap">
                    <div class="flex-col">
                        <h1 class="text-4xl font-bold">${titleS}</h1>
                        <p class="text-lg mt-4">${descriptionS}</p>
                    </div>${versionTypeS.size == 0 ? "" : renderSelector(versions, versionTypeS.size === 2)}
                </div>
            </header>
            <main class="mt-4">
                <div class="flex gap-x-4">
                    <div className="flex-col print:hidden max-md:hidden mt-[-1em]" aria-hidden="true" inert>
                        <nav className="top-0 left-0 select-none w-36 overflow-scroll sticky">
                            <div id="_arpc_sidebar_container" className="mt-[1em]"></div>
                        </nav>
                    </div>
                    <div class="flex-col" id="_arpc_holder">
                        ${versions.length > 0 ? htmlContent(versions[0]) : ""}
                    </div>
                </div>
            </main>
        </div>
        <script>${blocking}</script>
    </body>
</html>`;
};
