import React from "react";

const headings = {
    heading: "h3",
    subheading: "h4",
};

const styleClasses = {
    heading: "text-xl mb-4",
    subheading: "text-lg my-4",
} satisfies typeof headings;

export function slugify(title: string) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

export function createTitle(type: keyof typeof headings, title: string) {
    const id = slugify(title);
    return React.createElement(
        headings[type],
        { className: styleClasses[type], id },
        <a href={`#${id}`}>{title}</a>,
    );
}
