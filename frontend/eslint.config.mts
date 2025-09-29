import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier";

export default [
  js.configs.recommended, // ESLint's recommended JS rules
  ...tseslint.configs.recommended, // TypeScript support
  prettier, // disable conflicting ESLint style rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
      },
    },
    plugins: {
      prettier: eslintPluginPrettier, // Enable Prettier as an ESLint rule
    },
    rules: {
      // Example rules — tweak as you like
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "off", // TODO: configure logging
      eqeqeq: ["error", "always"],
      "prettier/prettier": "error", // Enforce Prettier rules as errors
    },
  },

  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "off", // TODO: configure logging
    },
  },

  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "*.config.js",
      "*.config.mjs",
      "**/*.d.ts", // ignore all type declaration files
    ],
  },
];
