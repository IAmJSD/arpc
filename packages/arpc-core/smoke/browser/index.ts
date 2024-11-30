import { encode } from "@msgpack/msgpack";
import { router, useRequest } from "../../src";
import { null as Null } from "valibot";

const req = new Request("https://example.com?version=v1&route=test", {
    method: "POST",
    body: encode(null),
});

const r = router().setRoutes({
    v1: {
        test: {
            input: Null(),
            output: Null(),
            method: async () => {
                if (useRequest() !== req) {
                    throw new Error("Request mismatch");
                }
                return null;
            },
        },
    },
});

const hn = r.buildHttpHandler();

(async () => {
    const resp = await hn(req);
    if (resp.status === 204) {
        console.log("SMOKE SUCCESS");
    }
})();
