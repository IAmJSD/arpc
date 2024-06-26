"use client";

import React from "react";

function flattenChildren(children: React.ReactNode): React.ReactElement[] {
    return React.Children.toArray(children).flatMap((child) => {
        if (React.isValidElement(child)) {
            return [child, ...flattenChildren(child.props.children)];
        }
        return [];
    });
}

function useTagMatch(tag: RegExp, children: React.ReactNode) {
    return React.useMemo(() => {
        return flattenChildren(children).filter((child) => {
            return React.isValidElement(child) && typeof child.type === "string"
                && tag.test(child.type);
        });
    }, [children]);
}

function watchRefs(
    refs: React.RefObject<HTMLElement>[],
    childrenRef: React.RefObject<HTMLElement>,
) {
    // If we don't have the children ref, return early.
    if (!childrenRef.current) return;

    // Create the handler.
    const hn = () => {
        // Iterate through and find what should be highlighted.
        const highlighted: HTMLElement[] = [];
        const unhighlighted: HTMLElement[] = [];
        for (
            const element of
            childrenRef.current!.querySelectorAll("h1, h2, h3, h4, h5, h6")
        ) {
            // Go through each ref.
            for (const ref of refs) {
                if (ref.current?.dataset?.labels === element.id) {
                    // Figure out if we want to bold this.
                    const rect = element.getBoundingClientRect();
                    const withinViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
                    (withinViewport ? highlighted : unhighlighted).push(ref.current!);

                    // Break looking through the loop.
                    break;
                }
            }
        }

        // Return early if highlighted is empty.
        if (highlighted.length === 0) return;

        // Update the elements.
        for (const el of unhighlighted) el.style.fontWeight = "normal";
        for (const el of highlighted) el.style.fontWeight = "bold";
    };
    window.addEventListener("scroll", hn);

    // Call the handler.
    hn();

    // Cleanup the event listener.
    return () => window.removeEventListener("scroll", hn);
}

function escapeCss(text: string) {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

let ticker = 0;

function NoSearchWrapper({ text }: { text: string }) {
    const ref = React.createRef<HTMLSpanElement>();

    React.useEffect(() => {
        // Return early if we aren't rendered yet.
        if (!ref.current) return;

        // Create the style class.
        const id = `no-search-${ticker++}`;
        const style = document.createElement("style");
        style.innerText = `.${id}:before {content: "${escapeCss(text)}"}`;
        document.head.appendChild(style);

        // Set the class.
        ref.current.classList.add(id);
        ref.current.innerHTML = "";

        // Cleanup the style.
        return () => {
            style.remove();
            if (ref.current) {
                ref.current.classList.remove(id);
                ref.current.innerText = text;   
            }
        };
    }, [text, ref.current]);

    return (
        <span ref={ref}>
            {text}
        </span>
    );
}

function noSearch(children: React.ReactNode) {
    const a = React.Children.toArray(children);
    if (a.length === 0) return "";
    const first = a[0];
    if (React.isValidElement(first) && first.type === "a") {
        const props = {...first.props};
        if (typeof props.children === "string") {
            props.children = (
                <NoSearchWrapper
                    text={props.children as string}
                />
            );
        }
        return React.createElement(first.type, props);
    }
    return children;
}

function ProgressSidebar({ children, childrenRef }: {
    children: React.ReactNode;
    childrenRef: React.RefObject<HTMLElement>;
}) {
    // Get the headings via analysing the initial content.
    const headings = useTagMatch(/^h[1-6]$/, children);
    const smallest = React.useMemo(() => {
        if (headings.length === 0) return 0;
        return parseInt((headings[0].type as string).substring(1), 16);
    }, [children]);

    // Build the elements and refs.
    const refs: React.RefObject<HTMLElement>[] = [];
    const elements: React.ReactElement[] = [];
    for (const h of headings) {
        // Defines the key within our local array.
        const key = `${h.type}_${h.key}_${h.props.children}_${h.props.id}`;

        // Build the ref we will use locally.
        const ref = React.createRef<HTMLParagraphElement>();
        refs.push(ref);

        // Get the elements text content and make a paragraph.
        elements.push(
            <p style={{
                marginLeft: `${(parseInt((h.type as string).substring(1), 16) - smallest)}rem`,
            }} data-labels={h.props.id} ref={ref} key={key}>
                {noSearch(h.props.children)}
            </p>,
        );
    }

    // Use an effect to watch the scroll position and update the active element.
    React.useEffect(() => watchRefs(refs, childrenRef), [
        refs.length, childrenRef.current, refs,
    ]);

    // Return the elements.
    return (
        <nav className="top-0 left-0 select-none w-36 overflow-scroll sticky">
            <div className="mt-[1em]">
                {elements}
            </div>
        </nav>
    );
}

export function Article(props: { children: React.ReactNode }) {
    const ref = React.useRef<HTMLDivElement>(null);
    return (
        <article className="flex" id="__article">
            <div className="flex-col print:hidden max-md:hidden mt-[-1em]" aria-hidden="true">
                <ProgressSidebar childrenRef={ref}>{props.children}</ProgressSidebar>
            </div>
            <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 ml-8 mr-6 print:hidden max-md:hidden" />
            <div className="flex-grow flex-col">
                <div className="block" ref={ref}>
                    {props.children}
                </div>
            </div>
        </article>
    );
}
