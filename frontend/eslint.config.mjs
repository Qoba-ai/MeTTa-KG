import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"]},
  {languageOptions: { globals: globals.browser }},
  {rules: {
    'no-unused-vars': 'off'
  }},
  {ignores: ["src/main.ts"]},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];