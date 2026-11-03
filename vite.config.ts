import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5678,
    // Reachable from the owner's other devices over Tailscale (http://pc:5678); the Windows firewall only lets the
    // tailnet in. Google sign-in still needs http://localhost:5678, its registered redirect
    host: true,
    allowedHosts: ['pc', '.ts.net'],
    proxy: {
      '/api': {
        target: 'http://localhost:3456',
      },
      '/socket.io': {
        target: 'http://localhost:3456',
        ws: true,
      },
    },
  },
});
