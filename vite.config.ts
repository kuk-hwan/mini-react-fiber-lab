import { defineConfig } from 'vite';

const apiTarget = process.env.API_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
  build: { target: 'es2022' },
});
