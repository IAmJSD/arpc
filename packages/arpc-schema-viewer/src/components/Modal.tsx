"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Divider } from "./Divider";

function BodyPortal({ children }: { children: React.ReactNode }) {
    // Make the element for the portal to go into.
    const [rootElement, setRootElement] = React.useState<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const div = document.createElement("div");
        document.body.prepend(div);
        setRootElement(div);
        return () => div.remove();
    }, []);

    // Mount the children in the portal.
    return rootElement ? createPortal(children, rootElement) : <></>;
}

type Props = {
    title: string;
    children: React.ReactNode;
    close: () => void;
};

interface TargetEvent {
    target: any;
}

export function Modal({ title, children, close }: Props) {
    // Generate a unique ID for the modal for a11y.
    const modalId = React.useId();

    // Handle attempts to close the dialog from the outside.
    const contentRef = React.useRef<HTMLDivElement>(null);
    const closingEvent = (e: TargetEvent) => {
        // Check if it targets the dialog content.
        let target = e.target as HTMLElement;
        while (target) {
            if (target === contentRef.current) {
                // Return early if the target is the content.
                return;
            }
            target = target.parentElement as HTMLElement;
        }

        // Close the dialog.
        close();
    };

    // Return the modal contents.
    return (
        <BodyPortal>
            <dialog
                id={modalId}
                open
                className="w-screen h-screen fixed top-0 bg-black bg-opacity-50 dark:text-white z-50"
                onClick={closingEvent}
                onKeyDown={(e) => {
                    if (e.key === "Escape") closingEvent(e);
                }}
            >
                <div ref={contentRef} className="p-4 bg-white dark:bg-neutral-900 w-max my-8 mx-auto rounded-lg">
                    <div className="flex">
                        <div className="flex-grow flex-col">
                            <h1 className="text-xl">{title}</h1>
                        </div>

                        <div className="flex-col my-auto ml-4 mt-[-2px]">
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                close();
                                return false;
                            }}>
                                <button
                                    className="text-2xl" aria-controls={modalId}
                                    aria-label="Close"
                                >
                                    ⨯
                                </button>
                            </form>
                        </div>
                    </div>

                    <Divider />

                    {children}
                </div>
            </dialog>
        </BodyPortal>
    );
}
