"use client";

import React from "react";
import type { BuildData } from "@arpc-packages/client-gen";
import { Article } from "./components/Article";

type Props = {
    buildData: BuildData;
};

export function Documentation({ buildData }: Props) {
    return (
        <Article>
            hello
        </Article>
    )
}
