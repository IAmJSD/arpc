import { API_VERSION_SELECTOR, ALL_VERSIONS, STABLE_VERSIONS_ONLY } from "./consts";
import { sanitize } from "./utils";

export function renderSelect() {
    // Defines the versions to add.
    const versionsToAdd = ALL_VERSIONS.filter((version) => {
        if (STABLE_VERSIONS_ONLY?.checked) {
            return !version.includes("a") && !version.includes("b");
        }
        return true;
    }).map((v) => `<option value="${sanitize(v)}">${sanitize(v)}</option>`).join("");

    // Set the innerHTML of the select element.
    API_VERSION_SELECTOR.innerHTML = versionsToAdd;

    // If the checkbox is checked, make sure a stable option is selected.
    if (STABLE_VERSIONS_ONLY?.checked && (
        API_VERSION_SELECTOR.value.includes("a") ||
        API_VERSION_SELECTOR.value.includes("b")
    )) {
        // Select the first stable version.
        API_VERSION_SELECTOR.value = (API_VERSION_SELECTOR.children[0] as HTMLOptionElement).value;
    }
}
