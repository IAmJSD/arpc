import { sanitize, slugify } from "./utils";

export default (title: string, size: 2 | 3, firstReset: boolean, apiVersion?: string) => {
    const slug = slugify(title, apiVersion);

    const linkAnchor = `<a href="#${slug}" aria-label="Copy link" data-copiable>🔗</a>`;

    return `<h${size} id="${slug}" class="${size === 2 ? "text-2xl" : "text-xl"} font-bold ${firstReset ? "first:mt-0" : ""} mt-4"><span data-txt>${sanitize(title)}</span> ${linkAnchor}</h${size}>`;
};
