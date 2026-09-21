import { fileURLToPath, URL } from 'node:url'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  plugins: [vue(), ...(mode === 'desktop' ? [{
    name: 'sanye-desktop-local-covers',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
          if (!['GET', 'HEAD'].includes(req.method || '') || !pathname.startsWith('/admin-profile/profile/')) return next()
          const root = await realpath(fileURLToPath(new URL('../sanye_desktop/runtime/client/admin-profile/profile', import.meta.url)))
          const file = await realpath(path.resolve(root, pathname.slice('/admin-profile/profile/'.length)))
          const relative = path.relative(root, file)
          if (relative.startsWith('..') || path.isAbsolute(relative)) { res.statusCode = 403; res.end(); return }
          const mime: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
          const type = mime[path.extname(file).toLowerCase()]
          if (!type || !(await stat(file)).isFile()) return next()
          res.setHeader('Content-Type', type)
          res.setHeader('X-Content-Type-Options', 'nosniff')
          if (req.method === 'HEAD') res.end()
          else createReadStream(file).on('error', () => res.destroy()).pipe(res)
        })().catch(() => next())
      })
    },
  }] : [])],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8091', changeOrigin: true },
      ...(mode === 'desktop' ? {} : {
        '/covers': { target: 'http://localhost:8091', changeOrigin: true },
        '/admin-profile': { target: 'http://localhost:8091', changeOrigin: true },
      }),
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
