import { defineConfig } from 'vite';

export default defineConfig({
  base: '/routecost/',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
