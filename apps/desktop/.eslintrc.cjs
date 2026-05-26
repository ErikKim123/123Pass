/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: false,
  rules: {
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
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.name='Math'][property.name='random']",
        message: 'Use getRandomBytes() from @123pass/core-crypto.',
      },
    ],
  },
};
