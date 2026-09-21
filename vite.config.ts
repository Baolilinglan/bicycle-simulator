import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    // Rapier compat embeds its WASM so this app works without a WASM CDN.
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { manualChunks: { physics: ['@dimforge/rapier3d-compat'], graphics: ['three'] } } },
  },
});
