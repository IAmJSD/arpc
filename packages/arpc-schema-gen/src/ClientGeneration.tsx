import type { BuildData } from "@arpc/client-gen";
import { useEffect, useState } from "react";

type Props = {
    schema: BuildData;
}

export default function ClientGeneration({ schema }: Props) {
    // Async import @arpc/client-gen since it is quite large.
    const [g, setG] = useState<typeof import("@arpc/client-gen") | null>(null);
    useEffect(() => {
        let mounted = true;
        import("@arpc/client-gen").then((g) => {
            if (mounted) setG(g);
        });
        return () => { mounted = false; };
    }, []);

    // TODO
}
