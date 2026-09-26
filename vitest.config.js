import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globalSetup: ["./test/globalSetup.js"],
        setupFiles: ["./test/setup.js"],
        // one in-memory MongoDB is shared, so test files run one at a time
        fileParallelism: false,
        testTimeout: 30000,
        hookTimeout: 120000,
    },
});
