import type { Signature } from "@arpc-packages/client-gen";

function renderType(signature: Signature) {
    let nullable = false;
    let items = new Set<string>();

    const s = () => {
        switch (signature.type) {
        case "nullable":
            nullable = true;
            signature = signature.inner;
            return s();
        case "array":
            signature = signature.inner;
            const oldItems = items;
            items = new Set();
            s();
            const arrStr = Array.from(items).join(" | ");
            const bracketed = items.size > 1 ? `(${arrStr})[]` : `${arrStr}[]`;
            items = oldItems;
            items.add(bracketed);
            return;
        case "literal":
            items.add(String(signature.value));
            return;
        case "union":
            for (const inner of signature.inner) {
                items.add(renderType(inner));
            }
            return;
        case "enum_key":
            items.add(`keyof ${signature.enum}`);
            return;
        case "enum_value":
            items.add(`valueof ${signature.enum}`);
            return;
        case "map":
            items.add(`Map<${renderType(signature.key)}, ${renderType(signature.value)}>`);
            return;
        case "object":
            items.add(signature.key);
            return;
        case "string":
        case "number":
        case "bigint":
        case "boolean":
            items.add(signature.type);
            return;
        }
    };
    s();

    const itemsStr = Array.from(items).join(" | ");
    return nullable ? items.size > 1 ? `(${itemsStr})?` : `${itemsStr}?` : itemsStr;
}

export default renderType;
