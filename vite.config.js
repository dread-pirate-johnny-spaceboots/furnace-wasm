import path from 'node:path'

import { defineConfig } from 'vite'

const crossOriginHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig({
  base: './',
  root: 'web',
  publicDir: 'public',
  server: {
    host: true,
    headers: crossOriginHeaders,
  },
  preview: {
    host: true,
    headers: crossOriginHeaders,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        gui: path.resolve(__dirname, 'web/gui/index.html'),
      },
    },
  },
})
