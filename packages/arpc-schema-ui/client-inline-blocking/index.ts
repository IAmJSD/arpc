// This package is minified and put into a script tag that is included in the client HTML.
// This NEEDS to be very small since it is included blocking in all HTML generations for the API documentation.

import { renderSelect } from "./renderSelect";
import { displayCorrectVersion } from "./displayCorrectVersion";
import { renderSidebar } from "./renderSidebar";
import { ALL_VERSIONS, API_VERSION_SELECTOR, STABLE_VERSIONS_ONLY } from "./consts";

// Handle window hashes.
const hashSplit = window.location.hash.slice(1).split("_");
if (hashSplit.length !== 1) {
    const [version] = hashSplit;
    if (ALL_VERSIONS.includes(version)) {
        if (version.includes("a") || version.includes("b")) {
            // Make sure the checkbox is unchecked.
            (STABLE_VERSIONS_ONLY as HTMLInputElement || {}).checked = false;
        }
        API_VERSION_SELECTOR.value = version;
    }
}

// The type is a little bit of a lie, but for sharing its fine. The lie is that this can be null if there are no versions.
// If there aren't, nothing will be rendered anyway.
if (API_VERSION_SELECTOR) {
    // Render the select element initially. We need to start with them all there because the client needs to know which
    // versions are available.
    renderSelect();

    // Render the content now in case the first item was a unstable version.
    displayCorrectVersion();
    renderSidebar();

    // Un-hide the select element.
    API_VERSION_SELECTOR.classList.remove("hidden");

    // Hook when the user changes the version.
    API_VERSION_SELECTOR.addEventListener("change", () => {
        displayCorrectVersion();
        renderSidebar();
    });

    // Resize the sidebar when the window is resized or the user scrolls.
    window.addEventListener("resize", () => {
        renderSidebar();
    });
    window.addEventListener("scroll", () => {
        renderSidebar();
    });

    // Hook when the user clicks the stable versions only checkbox. The checkbox doesn't exist when only category exists.
    STABLE_VERSIONS_ONLY?.addEventListener("change", (e) => {
        const selectValBefore = API_VERSION_SELECTOR.value;
        renderSelect();
        if ((e.target as HTMLInputElement).checked) {
            // Perform a re-render of the content if it was a un-stable version before.
            if (selectValBefore.includes("a") || selectValBefore.includes("b")) {
                displayCorrectVersion();
                renderSidebar();
            }
        }
    });
}

// Anything with link-copiable should be copied to the clipboard when clicked.
document.querySelectorAll("[data-copiable]").forEach((element) => {
    element.addEventListener("click", (e) => {
        const href = (e.target as HTMLAnchorElement).href;
        if (!href) return;
        const url = new URL(window.location.href, href);
        navigator.clipboard.writeText(url.toString());
    });
});
