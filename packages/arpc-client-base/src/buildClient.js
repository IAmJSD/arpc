import { BaseClient } from "./BaseClient";

export function buildClient(schema, token, tokenType) {
    return new BaseClient(schema, token, tokenType);
}
