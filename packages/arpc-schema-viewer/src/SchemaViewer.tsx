import React from "react";
import type { BuildData } from "@arpc-packages/client-gen";
import Head from "next/head";
import { Container } from "./components/Container";
import { Header } from "./components/Header";
import { Divider } from "./components/Divider";
import { Documentation } from "./Documentation";

type Props = {
    title: string;
    description: string;
    schema: BuildData;
};

export function SchemaViewer({ title, description, schema }: Props) {
    return (
        <Container>
            <Header
                title={title}
                description={description}
                buildData={schema}
            />
            <div className="my-6">
                <Divider />
            </div>
            <Documentation buildData={schema} />
        </Container>
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
