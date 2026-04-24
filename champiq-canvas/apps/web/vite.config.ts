/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@champiq/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@manifests': path.resolve(__dirname, '../../manifests'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: {
    // Raise the chunk-size warning threshold (we know about @rjsf)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy vendor code into separate cacheable chunks.
        // Vite 8 uses Rolldown which requires manualChunks as a function.
        // The browser loads each chunk once and caches it independently —
        // a canvas logic change won't bust the React or ReactFlow cache.
        manualChunks(id: string) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('@xyflow/')) {
            return 'vendor-flow'
          }
          if (id.includes('@rjsf/') || (id.includes('node_modules/ajv') && !id.includes('ajv-formats')) ||
              id.includes('ajv-formats')) {
            return 'vendor-rjsf'
          }
          if (id.includes('node_modules/zustand/') || id.includes('node_modules/clsx/') ||
              id.includes('node_modules/tailwind-merge/') || id.includes('node_modules/class-variance-authority/')) {
            return 'vendor-utils'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
