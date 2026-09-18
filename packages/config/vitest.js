import { defineConfig } from 'vitest/config';

/** Shared Vitest config for every package. Node environment by default. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
