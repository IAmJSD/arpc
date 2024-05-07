import { buildClient } from "./src";

const client = buildClient({
  version: "v1",
  exceptions: {},
  hostname: null,
  routes: {
    memes: {
      get: {
        mutation: false,
        $input: (null as unknown) as string,
        $output: (null as unknown) as boolean,
      }
    }
  },
});

client.batch(client => [
  client.memes.get("test"),
])
