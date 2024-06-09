import React from "react";

export function atom<T>(defaultValue: T) {
    let value = defaultValue;
    const listeners: ((value: T) => void)[] = [];
    return {
        get() {
            return value;
        },
        set(newValue: T) {
            value = newValue;
            for (const listener of listeners) {
                listener(value);
            }
        },
        on(listener: (value: T) => void) {
            listeners.push(listener);
        },
        removeEventListener(listener: (value: T) => void) {
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        },
    };
}

type Atom<T> = ReturnType<typeof atom<T>>;

export function useAtom<T>(atom: Atom<T>) {
    const value = React.useSyncExternalStore(
        (onStoreChange) => {
            atom.on(onStoreChange);
            return () => atom.removeEventListener(onStoreChange);
        },
        () => atom.get(),
        () => atom.get(),
    );
    return [value, (v: T) => atom.set(v)] as const;
}
