import { Object, Signature } from "./BuildData";

export function sortByObjectHeaviness(sigs: Signature[], objects: Object[]) {
    return sigs.sort((a, b) => {
        if (a.type === "object" && b.type === "object") {
            // Get the objects.
            const aObj = objects.find((o) => o.name === a.key);
            const bObj = objects.find((o) => o.name === b.key);
            if (aObj && bObj) {
                return Object.keys(bObj.fields).length - Object.keys(aObj.fields).length;
            }
        }
        return 0;
    });
}
