"use client";

import type { BuildData, Client } from "@arpc-packages/client-gen";
import { atom, useAtom } from "../utils/atoms";
import React from "react";

const apiAtom = atom<number | null>(null);

export function useClient(buildData: BuildData) {
    const [v] = useAtom(apiAtom);
    if (v === null) {
        // If the global atom is unset, find the first stable version.
        const x = buildData.clients.find((client) => !client.apiVersion.match(/a|b[0-9]+$/g));
        if (!x) return buildData.clients[buildData.clients.length - 1] as Client | undefined;
        return x;
    }
    return buildData.clients[v];
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
    let [clientIndex, setClientIndex] = useAtom(apiAtom);
    const [alpha, setAlpha] = React.useState(false);
    const [beta, setBeta] = React.useState(false);
    const client = React.useMemo(() => {
        // Set the default for when the page initially loads.
        if (clientIndex === null) {
            // Find the last stable client.
            for (let i = buildData.clients.length - 1; i >= 0; i--) {
                if (!buildData.clients[i].apiVersion.match(/a|b[0-9]+$/g)) {
                    setClientIndex(i);
                    return buildData.clients[i];
                }
            }
        }

        // If there is a client index, return the client.
        if (clientIndex !== null) return buildData.clients[clientIndex];

        // Turn on the flag to show the last client.
        const last = buildData.clients[buildData.clients.length - 1];
        if (!last) return undefined;
        if (last.apiVersion.match(ALPHA_REGEX)) setAlpha(true);
        if (last.apiVersion.match(BETA_REGEX)) setBeta(true);
        return last;
    }, [clientIndex, buildData.clients]);

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
            <span className="font-bold">API Version:</span> {client?.apiVersion}
        </p>
    );

    // Defines the form element to display for switching.
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

    // If there is no client, return nothing.
    if (!client) return null;

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
