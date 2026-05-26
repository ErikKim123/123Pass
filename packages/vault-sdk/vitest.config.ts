import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000, // KDF + ECDH benchmarks can run >5s on cold CI runners
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts', 'src/infrastructure/supabase-client.ts'],
      thresholds: {
        // vault-sdk coverage target — lower than core-crypto because the Supabase adapter
        // cannot be exercised without a live DB. Mock-driven UseCases must stay ≥85% lines.
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
});
