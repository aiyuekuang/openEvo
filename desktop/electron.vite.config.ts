import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        evolang: resolve(__dirname, '../evolang/src'),
      },
    },
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
