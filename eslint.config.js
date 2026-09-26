import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["node_modules/**", "public/**", "scripts/**", "coverage/**"] },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module",
            globals: { ...globals.node },
        },
        rules: {
            // unused catch bindings and _-prefixed args/vars are intentional
            "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
            "no-console": "error", // use src/utils/logger.js
            eqeqeq: ["error", "always", { null: "ignore" }],
        },
    },
    {
        files: ["test/**/*.js", "vitest.config.js"],
        rules: { "no-console": "off" },
    },
];
