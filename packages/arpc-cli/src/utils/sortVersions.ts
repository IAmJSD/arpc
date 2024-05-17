export const API_REVISION_REGEX = /^v(\d+)([ab]\d+)?$/;

export function sortVersions(a: string[]) {
    return a.sort((a, b) => {
        const aMatch = a.match(API_REVISION_REGEX);
        const bMatch = b.match(API_REVISION_REGEX);

        if (!aMatch || !bMatch) {
            return a.localeCompare(b);
        }

        const aVersion = Number(aMatch[1]);
        const bVersion = Number(bMatch[1]);

        if (aVersion !== bVersion) {
            return aVersion - bVersion;
        }

        const aAlpha = aMatch[2] ? aMatch[2].charCodeAt(0) : 0;
        const bAlpha = bMatch[2] ? bMatch[2].charCodeAt(0) : 0;
        if (aAlpha !== bAlpha) {
            return aAlpha - bAlpha;
        }

        if (aMatch[2] && bMatch[2]) {
            const aBeta = Number(aMatch[2].slice(1));
            const bBeta = Number(bMatch[2].slice(1));
            return aBeta - bBeta;
        }

        return 0;
    });
}
