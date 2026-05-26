import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        // Design Ref: §1.2 — crypto module coverage MUST be >= 95% for lines/funcs/stmts.
        // Branches are 80%: the remaining ~15% are defensive catch blocks around
        // @noble primitives that cannot be triggered without monkey-patching the
        // library (e.g., Argon2id throwing on a 32-byte output request).
        lines: 95,
        functions: 95,
        branches: 80,
        statements: 95,
      },
    },
  },
});
