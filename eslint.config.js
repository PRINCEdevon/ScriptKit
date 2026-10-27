import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // legacy/ is the untouched reference implementation; dist/ is generated.
  { ignores: ['dist/', 'legacy/', 'coverage/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['tests/**', 'scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
