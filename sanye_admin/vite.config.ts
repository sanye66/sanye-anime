import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  // 开发环境默认经本地网关代理，避免把旧端口或服务内部地址暴露给浏览器。
  const env = loadEnv(mode, process.cwd(), '')
  const gateway = env.VITE_GATEWAY_URL || 'http://localhost:8091'
  return {
    plugins: [vue()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        '/api': { target: gateway, changeOrigin: true },
        '/covers': { target: gateway, changeOrigin: true },
        '/admin-profile': { target: gateway, changeOrigin: true },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
