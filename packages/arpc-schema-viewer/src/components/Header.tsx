"use client";

import React from "react";
import type { BuildData } from "@arpc-packages/client-gen";
import { ClientButtons } from "./ClientButtons";
import { Button } from "./Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { VersionSwitcher } from "./VersionSwitcher";

type Props = {
    title: string;
    description: string;
    buildData: BuildData;
};

function ClientGenerators({ buildData }: { buildData: BuildData }) {
    // Create the generator buttons.
    const [buttons, setButtons] = React.useState<React.ReactNode | null>(null);
    React.useEffect(() => {
        import("@arpc-packages/client-gen").then((pkg) => {
            setButtons(<ClientButtons pkg={pkg} buildData={buildData} />);
        });
    }, []);

    // Return the template to hold the buttons.
    return (
        <aside className="block shadow-md bg-gray-50 dark:bg-neutral-900 p-4 rounded-md select-none">
            <h3 className="text-xl font-bold">Client Generators</h3>
            <p className="text-sm mt-2">Generate clients for this API in a programming language that you need:</p>
            {buttons}
        </aside>
    );
}

export function Header({ title, description, buildData }: Props) {
    return (
        <header className="md:flex">
            <div className="md:flex-col md:flex-grow md:mr-5">
                <h1 className="text-2xl mb-4">{title}</h1>
                <h2>{description}</h2>

                <div className="block mt-4 select-none">
                    <div className="flex flex-wrap">
                        <span className="print:hidden pt-3 my-auto mr-5">
                            <Button
                                styles="regular"
                                onClick={() => window.print()}
                            >
                                <FontAwesomeIcon icon={faFloppyDisk} className="mr-2" />
                                Save or Print Documentation
                            </Button>
                        </span>
                        <VersionSwitcher buildData={buildData} />
                    </div>
                </div>
            </div>
            <div className="min-w-36 max-md:w-full max-md:my-8 md:flex-col md:my-auto print:hidden">
                <ClientGenerators buildData={buildData} />
            </div>
        </header>
    );
}
