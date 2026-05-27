/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: false,
  extends: ['next/core-web-vitals'],
  rules: {
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
            message: 'Admin app must use @123pass/vault-sdk, not @supabase/* directly.',
          },
          {
            group: ['@noble/*'],
            message: 'Admin app must use @123pass/core-crypto, not @noble/* directly.',
          },
        ],
      },
    ],
  },
};
