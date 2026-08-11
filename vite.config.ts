import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const backendOrigin = process.env.VITE_BACKEND_ORIGIN ?? 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendOrigin,
      },
    },
  },
})
