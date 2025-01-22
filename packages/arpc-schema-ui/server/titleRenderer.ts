import { sanitize, slugify } from "./utils";

export default (title: string, size: 2 | 3) => {
    const slug = slugify(title);

    const linkAnchor = `<a href="#${slug}" aria-label="Copy link" data-copiable>🔗</a>`;

    return `<h${size} id="${slug}" class="${size === 2 ? "text-2xl" : "text-xl"} font-bold">${sanitize(title)} ${linkAnchor}</h${size}>`;
};
