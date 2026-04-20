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
    port: 3001,
    proxy: {
      '/api': 'http://localhost:58000',
      '/ws': { target: 'ws://localhost:58000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
