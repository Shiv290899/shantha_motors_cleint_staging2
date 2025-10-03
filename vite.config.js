/* eslint-env node */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { cwd } from 'node:process'

// https://vite.dev/config/
export default ({ mode }) => {
  // Use Node's cwd via explicit import to satisfy linters
  const env = loadEnv(mode, cwd(), '')
  const backendOrigin = env.VITE_BACKEND_ORIGIN 
  return defineConfig({
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': '{}',
      global: 'globalThis',
    },
    // Keep dev comfortable; production optimizations are below in build.rollupOptions
    server: {
      proxy: {
        // Forward API calls during development
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
    // Production build tuning: split heavy vendors and relax the warning threshold
    build: {
      // Raise only the warning threshold; the build still optimizes output
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Group large dependencies into their own chunks to reduce initial payload
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react'
            if (id.includes('antd') || id.includes('@ant-design/icons')) return 'vendor-antd'
            if (id.includes('@reduxjs') || id.includes('react-redux')) return 'vendor-redux'
            if (id.includes('/xlsx')) return 'vendor-xlsx'
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-print'
            if (id.includes('/dayjs')) return 'vendor-dayjs'
            return 'vendor'
          },
        },
      },
    },
  })
}
