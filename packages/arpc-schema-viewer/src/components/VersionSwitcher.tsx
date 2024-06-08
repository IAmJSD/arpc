import { BuildData } from "@arpc-packages/client-gen";
import { atom, useAtom } from "jotai";
import React from "react";

const apiAtom = atom(0);

export function useClient(buildData: BuildData) {
    return buildData.clients[useAtom(apiAtom)[0]];
}

enum VersionType {
    STABLE,
    ALPHA,
    BETA,
};

const ALPHA_REGEX = /a[0-9]+$/g;
const BETA_REGEX = /b[0-9]+$/g;

const selectStyles = "ml-2 w-48 p-1 dark:bg-gray-800 rounded border-r-4 border-transparent";

export function VersionSwitcher({ buildData }: { buildData: BuildData }) {
    // Get the client from the context.
    const [clientIndex, setClientIndex] = useAtom(apiAtom);
    const client = buildData.clients[clientIndex];

    // If there is no client, return nothing.
    if (!client) return null;

    // Build the list of items.
    const listItems = React.useMemo(
        () => buildData.clients.map((client, i) => {
            let t = VersionType.STABLE;
            if (client.apiVersion.match(ALPHA_REGEX)) {
                t = VersionType.ALPHA;
            } else if (client.apiVersion.match(BETA_REGEX)) {
                t = VersionType.BETA;
            }

            return [client.apiVersion, i, t] as const;
        }).reverse(),
        [buildData.clients],
    );

    // Defines the paragraph to display for printing.
    const paragraph = (
        <p className="hidden print:block">
            <span className="font-bold">API Version:</span> {client.apiVersion}
        </p>
    );

    // Defines the form element to display for switching.
    const [alpha, setAlpha] = React.useState(false);
    const [beta, setBeta] = React.useState(false);
    const selectId = React.useId();
    const change = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = parseInt(e.target.value, 10);
        setClientIndex(id);
    };
    const selectMenu = (
        <form onSubmit={(e) => e.preventDefault()} className="print:hidden">
            <label htmlFor={selectId} className="font-bold">API Version:</label>
            <select
                className={selectStyles} id={selectId} aria-controls="__article"
                onChange={change}
            >
                {
                    listItems.filter(([,, t]) => {
                        if (t === VersionType.STABLE) return true;
                        if (alpha && t === VersionType.ALPHA) return true;
                        if (beta && t === VersionType.BETA) return true;
                        return false;
                    }).map(([label, i]) => {
                        return (
                            <option key={`${label}_${i}`} value={i}>
                                {label}
                            </option>
                        );
                    })
                }
            </select>
        </form>
    );

    // Defines the checkboxes to display for filtering.
    const checkboxes = (
        <form className="print:hidden flex mt-2" onSubmit={(e) => e.preventDefault()}>
            <label>
                <input
                    type="checkbox"
                    checked={alpha}
                    onChange={() => setAlpha((alpha) => !alpha)}
                />
                {" "}Include Alpha Versions
            </label>
            <label className="ml-2">
                <input
                    type="checkbox"
                    checked={beta}
                    onChange={() => setBeta((beta) => !beta)}
                />
                {" "}Include Beta Versions
            </label>
        </form>
    );

    // Return the content.
    return (
        <>
            {paragraph}
            <div className="block mt-2">
                {selectMenu}
                {checkboxes}
            </div>
        </>
    );
}
