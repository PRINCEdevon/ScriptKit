import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // legacy/ is the untouched reference implementation and src/legacy.js its transitional
  // copy (see docs/migration-plan.md); dist/ is generated.
  { ignores: ['dist/', 'legacy/', 'src/legacy.js', 'coverage/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['tests/**', 'scripts/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
