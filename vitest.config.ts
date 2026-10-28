import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Several suites build the full synthetic world and sign its ledger. On slower Windows machines,
  // with every worker busy, that exceeds the 5 second default. See docs/decisions.md (D1).
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/server/**', 'src/data/**', 'src/app/api/**'],
      reporter: ['text-summary', 'json-summary'],
      // Floors set a little under the measured values (97% lines, 87% branches) so a drop is noticed, not so noise fails.
      thresholds: { lines: 94, statements: 92, functions: 93, branches: 83 },
    },
  },
});
