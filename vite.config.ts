import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Caminhos relativos: o site funciona em qualquer endereço (ex.: usuario.github.io/nome-do-repo/)
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // O app chama /api/... e o Vite repassa ao mini servidor da IA (npm run server)
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
