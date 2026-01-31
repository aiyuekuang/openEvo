import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'app',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'app/src'),
      // 明确指向根目录的 @noble/ed25519
      '@noble/ed25519': path.resolve(__dirname, 'node_modules/@noble/ed25519'),
    },
  },
  // 确保 Vite 能从项目根目录解析 node_modules
  optimizeDeps: {
    include: ['@noble/ed25519'],
  },
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      // 允许访问项目根目录的 node_modules
      allow: [path.resolve(__dirname)],
    },
  },
})
