import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Several suites build the full synthetic world and sign its ledger. On slower Windows machines,
  // with every worker busy, that exceeds the 5 second default. See docs/decisions.md (D1).
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120_000, hookTimeout: 120_000 },
});
