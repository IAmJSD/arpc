export const ROOT_CONTAINER = document.getElementById("_arpc_root_container") as HTMLDivElement;
export const API_VERSION_SELECTOR = document.getElementById("_arpc_api_version_selector") as HTMLSelectElement;
export const STABLE_VERSIONS_ONLY = document.getElementById("_arpc_stable_versions_only") as HTMLInputElement | null;
export const SIDEBAR_CONTAINER = document.getElementById("_arpc_sidebar_container") as HTMLDivElement;

export const ALL_VERSIONS = Array.from(API_VERSION_SELECTOR?.children ?? []).map((child) => (child as HTMLOptionElement).value);
