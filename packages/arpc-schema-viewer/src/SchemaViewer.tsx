import React from "react";
import type { BuildData } from "@arpc/client-gen";
import Head from "next/head";

type Props = {
    schema: BuildData;
};

export function SchemaViewer({ schema }: Props) {
    return (
        <div>
            <div className="text-center text-2xl font-bold p-4">
                Coming soon!
            </div>
        </div>
    );
}

SchemaViewer.getLayout = function getLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Head>
                <title>arpc schema viewer</title>
            </Head>

            {children}
        </>
    );
};
