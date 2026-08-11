import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    // Vite's cold-start dependency crawl only follows imports reachable
    // from the main entry HTML — it doesn't look inside Web Workers.
    // wav2vec2Worker.js is the only importer of this (large) package, so
    // without listing it explicitly here, Vite only discovers it the first
    // time the worker actually runs, invalidates its dep cache, and issues
    // a full-page reload to apply the change — silently wiping all React
    // state mid-session on a cold dev server (e.g. every fresh CI run).
    include: ['@huggingface/transformers'],
  },
  test: {
    globals: true, 
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts'
  }
})
