import React from "react";

type Props = {
    children: React.ReactNode;
}

export function Container({ children }: Props) {
    return (
        <div className="m-8">
            <div className="max-w-7xl md:mx-auto">
                {children}
            </div>
        </div>
    );
}
