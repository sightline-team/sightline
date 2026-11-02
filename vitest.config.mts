import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      // `server-only` throws when imported without the react-server condition, which
      // is exactly what it is for — but that makes it untestable in a plain Node
      // process. Tests exercise the same module with the guard stubbed out; the guard
      // itself is verified by a real `next build` failing on a client-side import
      // (F-13 evidence), not here.
      'server-only': path.join(root, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      include: ['src/**'],
      exclude: ['src/app/**', '**/*.tsx'],
    },
  },
});
