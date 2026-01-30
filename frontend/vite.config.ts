import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/audit': 'http://localhost:5001',
      '/health': 'http://localhost:5001',
      '/status': 'http://localhost:5001',
    }
  },
  build: {
    outDir: 'dist',
  }
})
