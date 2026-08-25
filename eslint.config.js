import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": "error",
    },
  },
  // core runs in a browser tab, a worker and a node process, so it may not reach for
  // any of them. The build enforces this through `types: []`; this catches it at the
  // import that causes it rather than at whatever fails to compile afterwards.
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts", "packages/core/src/test-helpers/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "url"],
              message: "core must not depend on a platform. Put this in an app instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "packages/core/src/test-helpers/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Not part of the TypeScript project, so type-aware rules cannot run on it.
  {
    files: ["*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
