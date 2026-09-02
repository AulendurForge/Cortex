import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
