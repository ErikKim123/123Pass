/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  settings: {
    'import/resolver': {
      typescript: { project: ['packages/*/tsconfig.json', 'apps/*/tsconfig.json'] },
      node: true,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
        pathGroups: [{ pattern: '@123pass/**', group: 'internal', position: 'before' }],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@noble/*'],
            message:
              'Direct @noble imports are only allowed inside packages/core-crypto. Import from @123pass/core-crypto instead.',
          },
          {
            group: ['@supabase/*'],
            message:
              'Direct @supabase imports are only allowed inside packages/vault-sdk. Apps must use @123pass/vault-sdk instead.',
          },
        ],
      },
    ],
    // Design Ref: §7.1 V6.2.3 — Math.random is NOT a CSRNG. Always use getRandomBytes.
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.name='Math'][property.name='random']",
        message:
          'Math.random() is not cryptographically secure. Use getRandomBytes() from @123pass/core-crypto.',
      },
      {
        selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
        message:
          'Math.random() is not cryptographically secure. Use getRandomBytes() from @123pass/core-crypto.',
      },
    ],
  },
  overrides: [
    {
      files: ['packages/core-crypto/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              // core-crypto may import @noble/* freely, but still must not depend on @supabase/*.
              {
                group: ['@supabase/*'],
                message: 'core-crypto must not depend on Supabase or any backend.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['packages/vault-sdk/**/*.ts'],
      rules: {
        // vault-sdk is the only package allowed to import @supabase/*.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@noble/*'],
                message:
                  'Use @123pass/core-crypto instead of importing @noble directly from vault-sdk.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '.next', 'build', '*.cjs', '*.js'],
};
