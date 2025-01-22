export function sanitize(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function slugify(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "-");
}
