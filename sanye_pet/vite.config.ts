import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
  build: {
    outDir: process.env.SANYE_RUNNER_ONLY === '1' ? 'dist/runner' : 'dist/renderer',
    emptyOutDir: true,
    ...(process.env.SANYE_RUNNER_ONLY === '1' ? { rollupOptions: { input: path.resolve(__dirname, 'progress.html') } } : {}),
  },
})
