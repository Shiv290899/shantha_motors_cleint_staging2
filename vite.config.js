/* eslint-env node */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cwd } from 'node:process'

// https://vite.dev/config/
export default ({ mode }) => {
  // Use Node's cwd via explicit import to satisfy linters
  const env = loadEnv(mode, cwd(), '')
  const backendOrigin = env.VITE_BACKEND_ORIGIN || 'http://localhost:8082'
  return defineConfig({
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': '{}',
      global: 'globalThis',
    },
    // Keep dev comfortable; production tweaks live in the build section below
    server: {
      // Default dev port; can be overridden via VITE_PORT
      port: parseInt(env.VITE_PORT || '5174', 10),
      proxy: {
        // Forward API calls during development
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
    // Production build tuning: trust Rollup for chunking but keep the higher warning threshold
    build: {
      // Raise only the warning threshold; leave chunking to Rollup's defaults to avoid circular splits
      chunkSizeWarningLimit: 1200,
    },
  })
}
