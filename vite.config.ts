import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    // In production Express serves the policy at /privacy; in development the same address, from public/
    name: 'privacy-route',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/privacy') req.url = '/privacy.html';
        next();
      });
    },
  }],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5678,
    // Reachable from the owner's other devices over Tailscale (http://pc:5678); the Windows firewall only lets the
    // tailnet in. Google sign-in still needs http://localhost:5678, its registered redirect
    host: true,
    allowedHosts: ['pc', '.ts.net'],
    // Work in progress lives in git worktrees inside the repo: editing those must not reload the page being played
    watch: { ignored: ['**/.worktrees/**', '**/.claude/worktrees/**'] },
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
