import { ROOT_CONTAINER } from "./consts";

export function sanitize(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let lastSrEl: HTMLDivElement | null = null;

export function srAnnouncement(message: string) {
    const announcement = document.createElement("div");
    announcement.textContent = message;
    announcement.classList.add("arpc-announcement");
    announcement.setAttribute("aria-live", "assertive");
    announcement.setAttribute("aria-atomic", "true");
    if (lastSrEl) {
        lastSrEl.replaceWith(announcement);
    } else {
        ROOT_CONTAINER.appendChild(announcement);
    }
    lastSrEl = announcement;
}
