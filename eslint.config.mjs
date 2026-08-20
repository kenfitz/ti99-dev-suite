// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**', 'test/**', '*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // The codebase deliberately uses `any` in a few places where it is
      // bridging untyped JSON from ti99.json; flag rather than fail.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    // diagnostics.ts strips ANSI colour codes from assembler output, which
    // requires matching the ESC control character. The rule is right in
    // general and stays on everywhere else.
    //
    // Scoped here rather than as an inline eslint-disable comment on purpose:
    // this project's compiler preserves comments, so editing the source would
    // change out/build/diagnostics.js and break the byte-for-byte comparison
    // against the shipped build documented in docs/reconstruction.md.
    files: ['src/build/diagnostics.ts'],
    rules: { 'no-control-regex': 'off' },
  },
);
