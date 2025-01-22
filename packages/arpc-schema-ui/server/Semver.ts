const SEMVER_TYPE_REGEX = /[0-9]([a-zA-Z]+[0-9]+)$/;
const NUMBER_REGEX = /[0-9]/g;

function splitIntoParts(version: string) {
    const match = version.match(NUMBER_REGEX);
    if (match) {
        const index = match.index;
        return [version.substring(0, index), Number(version.substring(index!))] as const;
    }
    throw new Error("Invalid version");
}

export default class Semver {
    public major = 0;
    public minor: number | null = null;
    public patch: number | null = null;
    public type: string | null = null;

    constructor(version: string) {
        // Remove the type from the regex.
        const match = version.match(SEMVER_TYPE_REGEX);
        if (match) {
            const [, type] = match;
            this.type = type;
            version = version.substring(0, version.length - type.length);
        }
        if (version.startsWith("v")) version = version.substring(1);

        // Split by the dot.
        const s = version.split(".");
        if (s[0] === "") return;
        this.major = parseInt(s[0]);
        if (s.length > 1) this.minor = parseInt(s[1]);
        if (s.length > 2) this.patch = parseInt(s[2]);
    }

    toString() {
        const parts: string[] = [this.major.toString()];
        if (this.minor !== null) parts.push(this.minor.toString());
        if (this.patch !== null) parts.push(this.patch.toString());
        return `v${parts.join(".")}${this.type ? this.type : ""}`;
    }

    compare(other: Semver, typeCb?: (type: string | null) => void) {
        if (typeCb) typeCb(this.type);
        if (this.major !== other.major) return this.major - other.major;
        if (this.minor !== other.minor) return (this.minor ?? 0) - (other.minor ?? 0);
        if (this.patch !== other.patch) return (this.patch ?? 0) - (other.patch ?? 0);
        if (!this.type) {
            // This means this is stable, so higher than other.
            return 1;
        }
        if (!other.type) {
            // This means other is stable, so lower than other.
            return -1;
        }
        const [ourType, ourVersion] = splitIntoParts(this.toString());
        const [otherType, otherVersion] = splitIntoParts(other.toString());
        const typeLocaleCompare = ourType.localeCompare(otherType);
        if (typeLocaleCompare !== 0) return typeLocaleCompare;
        return ourVersion - otherVersion;
    }
}
