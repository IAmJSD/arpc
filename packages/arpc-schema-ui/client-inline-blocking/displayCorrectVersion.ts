import { API_VERSION_SELECTOR, ALL_VERSIONS } from "./consts";
import { srAnnouncement } from "./utils";

export function displayCorrectVersion() {
    for (const version of ALL_VERSIONS) {
        const domEl = document.getElementById(`_arpc_version_${version}`);
        if (API_VERSION_SELECTOR.value === version) {
            domEl?.classList.remove("hidden");
            srAnnouncement(`API version ${version} selected.`);
        } else {
            domEl?.classList.add("hidden");
        }
    }
}
