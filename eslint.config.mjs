// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// One config for the whole repo. typescript-eslint reads code with the root
// typescript@6 (it doesn't support TS 7 yet); packages typecheck with TS 7.
export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/.output/',
    '**/.wxt/',
    '**/dist/',
    '**/coverage/',
    // Third-party eval apps, cloned on demand by their run.sh.
    'eval/targets/*/src/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/extension/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    rules: {
      // Rule 5: never log raw bodies or header values. Banning console outright
      // is simpler to enforce than "log only safe things".
      'no-console': 'error',
    },
  },
  {
    // Rule 1: the engine is pure. Its tsconfig already rejects DOM and Node APIs
    // (fetch, timers, console); these are the standard-JS sources of
    // nondeterminism the compiler can't block. Deterministic Date use such as
    // Date.parse('2024-01-01') stays allowed.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The engine is pure (CLAUDE.md rule 1): take randomness as an input.' },
        { object: 'Date', property: 'now', message: 'The engine is pure (CLAUDE.md rule 1): take timestamps as an input.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The engine is pure (CLAUDE.md rule 1): new Date() reads the clock; take timestamps as an input.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'The engine is pure (CLAUDE.md rule 1): Date() reads the clock; take timestamps as an input.',
        },
      ],
    },
  },
);
