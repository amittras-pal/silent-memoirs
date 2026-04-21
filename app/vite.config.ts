import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/silent-memoirs/',
  plugins: [
    react(),
    VitePWA({ registerType: 'autoUpdate' })
  ],
})
