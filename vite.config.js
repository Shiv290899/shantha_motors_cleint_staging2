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
    server: {
      proxy: {
        // Forward API calls during development
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
  })
}
