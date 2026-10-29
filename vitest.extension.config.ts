import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./projects/shared/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['extension-core/**/*.spec.ts'],
  },
});
