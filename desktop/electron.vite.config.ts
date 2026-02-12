import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: 'main/index.ts'
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: 'preload/index.ts'
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: 'renderer',
    server: {
      port: 5188
    },
    build: {
      outDir: '../dist/renderer',
      rollupOptions: {
        input: 'renderer/index.html'
      }
    }
  }
})
