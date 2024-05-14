const QUOTES_RE = /^(["'`])(.*)\1$/;

export function dequotify(value: string): string {
    const match = QUOTES_RE.exec(value);
    if (!match) {
        return value;
    }

    return match[2];
}
