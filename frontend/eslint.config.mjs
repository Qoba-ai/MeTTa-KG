import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  // First, define ignores that apply globally
  {
    ignores: ["src/main.ts", "dist/**"]
  },
  // Then apply recommended configurations
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  // Then define rules for specific files or globally, ensuring globals are set
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"], // Apply these rules to all relevant files
    languageOptions: { globals: globals.browser },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-escape': 'off',
      'no-redeclare': 'off',
      'no-prototype-builtins': 'off',
      'no-empty': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
];