/**
 * Config para build do widget standalone (cofrito.js).
 * Gera um único bundle que pode ser embarcado via tag <script>.
 *
 * O widget é exposto como Web Component (<cofrito-widget>) e usa
 * Shadow DOM para isolar estilos.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-widget',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/widget-entry.tsx'),
      name: 'CofritoWidget',
      fileName: 'cofrito',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
})
