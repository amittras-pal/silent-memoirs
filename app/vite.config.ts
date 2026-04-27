import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/silent-memoirs/',
  resolve: {
    alias: {
      // The 'decode-named-character-reference' package exports a "browser"
      // condition that uses document.createElement(), which breaks in Web
      // Workers. Force the pure-JS implementation everywhere.
      'decode-named-character-reference': resolve(
        __dirname,
        'node_modules/decode-named-character-reference/index.js'
      ),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // fontkit has CJS transitive deps (brotli, clone, dfa, etc.) that break
    // in module workers during dev. Pre-bundling converts them to ESM.
    include: ['fontkit'],
  },
  plugins: [
    react(),
    VitePWA({
      // Disable service worker registration — no offline capabilities needed
      injectRegister: null,
      selfDestroying: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'Splash Logo.png'],
      manifest: {
        name: 'Silent Memoirs',
        short_name: 'Silent Memoirs',
        description: 'A private, encrypted personal journal — your memories, secured.',
        start_url: '/silent-memoirs/',
        scope: '/silent-memoirs/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#693419',
        theme_color: '#cd784d',
        lang: 'en',
        categories: ['lifestyle', 'productivity'],
        icons: [
          {
            src: '/silent-memoirs/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/silent-memoirs/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/silent-memoirs/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/silent-memoirs/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/silent-memoirs/Splash Logo.png',
            sizes: '598x598',
            type: 'image/png',
            label: 'Silent Memoirs',
          },
        ],
      },
    }),
  ],
})
