/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: false,
  extends: ['next/core-web-vitals'],
  rules: {
    // The repo-root eslint config also applies via inherited rules in CI;
    // we re-state the strict crypto guardrails here so `next lint` enforces them too.
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.name='Math'][property.name='random']",
        message: 'Use getRandomBytes() from @123pass/core-crypto.',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@supabase/*'],
            message: 'Apps must use @123pass/vault-sdk, not @supabase/* directly.',
          },
          {
            group: ['@noble/*'],
            message: 'Apps must use @123pass/core-crypto, not @noble/* directly.',
          },
        ],
      },
    ],
  },
};
