import React from "react";

const styles = {
    regular: "dark:bg-neutral-800 dark:hover:bg-zinc-700 bg-neutral-200 hover:bg-zinc-300",
} as const;

type Props = {
    children: React.ReactNode;
    onClick: () => void;
    styles: keyof typeof styles;
    disabled?: boolean;
};

export function Button(props: Props) {
    return (
        <form
            className="mb-2 mr-2 last:mr-0"
            onSubmit={(e) => {
                e.preventDefault();
                props.onClick();
                return false;
            }}
        >
            <button
                disabled={props.disabled}
                className={`px-4 py-2 rounded-md drop-shadow-sm disabled:opacity-40 ${styles[props.styles]}`}
            >
                {props.children}
            </button>
        </form>
    );
}
