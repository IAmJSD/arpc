import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            exclude: [
                ...(configDefaults.coverage?.exclude ?? []),
                "**/src/tests/utils/*", // Utils to make tests, not part of the public API
                "**/src/index.ts", // Literally just exports
                "**/smoke/**", // Smoke tests
            ],
        },
    },
});
