// Learn more about Vitest configuration options at https://vitest.dev/config/

import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Keep module mocks from one spec from affecting services imported by another.
    isolate: true,
  },
});
