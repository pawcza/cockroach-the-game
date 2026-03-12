import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://cockroach.wszystko.app',
        changeOrigin: true,
      },
    },
  },
});
