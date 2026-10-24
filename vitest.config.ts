import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'lab/**/*.test.ts'],
    environment: 'node',
  },
});
