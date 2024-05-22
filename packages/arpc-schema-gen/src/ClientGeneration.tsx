import type { BuildData } from "@arpc-packages/client-gen";
import { useEffect, useState } from "react";

type Props = {
    schema: BuildData;
}

export default function ClientGeneration({ schema }: Props) {
    // Async import @arpc-packages/client-gen since it is quite large.
    const [g, setG] = useState<typeof import("@arpc-packages/client-gen") | null>(null);
    useEffect(() => {
        let mounted = true;
        import("@arpc-packages/client-gen").then((g) => {
            if (mounted) setG(g);
        });
        return () => { mounted = false; };
    }, []);

    // TODO
}
