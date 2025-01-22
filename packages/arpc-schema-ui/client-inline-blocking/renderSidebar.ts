import { API_VERSION_SELECTOR, SIDEBAR_CONTAINER } from "./consts";

function recurseChildren(node: HTMLElement, callback: (node: HTMLElement) => void) {
    callback(node);
    for (const child of node.children) {
        recurseChildren(child as HTMLElement, callback);
    }
}

export function renderSidebar() {
    const domEl = document.getElementById(`_arpc_version_${API_VERSION_SELECTOR.value}`)!;
    SIDEBAR_CONTAINER.innerHTML = "";
    recurseChildren(domEl, (node) => {
        if (node.tagName.startsWith("H")) {
            let indentLength = Number(node.tagName.slice(1));
            if (!isNaN(indentLength)) {
                indentLength -= 2;
            } else {
                indentLength = 0;
            }
            const p = document.createElement("p");
            p.textContent = node.textContent;
            p.style.marginLeft = `${indentLength * 0.5}rem`;
            if (node.offsetHeight > 0) {
                p.style.fontWeight = "bold";
            }
            p.tabIndex = -1;
            SIDEBAR_CONTAINER.appendChild(p);
        }
    });
}
