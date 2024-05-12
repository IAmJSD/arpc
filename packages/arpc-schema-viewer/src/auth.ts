import { AbstractView } from "react";

export enum TokenTypes {
    Bearer = "Bearer",
}

export const defaultTokenType = TokenTypes.Bearer;

export default async function validate(token: string, tokenType: TokenTypes[keyof TokenTypes]): Promise<AbstractView | null> {
    return null;
}
