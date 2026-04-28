import { defineConfig } from 'vite';

// Cybervamp v2 build config.
// `base` MUST match the deployment URL path. We deploy to:
//   https://cybervampccg.github.io/v2/
// so base is '/v2/' in production.
// In dev mode (npm run dev), base is '/' so localhost works normally.

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/cybervamp.github.io/v2/' : '/',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
}));
