import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/nova-os/',
  build: {
    rollupOptions: {
      output: {
        // React + React DOM in their own chunk. They change only when the
        // dependency is upgraded, so an ordinary app edit no longer forces
        // every installed client to re-download the framework on the next
        // service-worker update — it re-fetches the app chunk alone.
        // Function form, not the object form: this project builds on Vite 8
        // / rolldown, which accepts only a function here (the object form
        // fails the build with "manualChunks is not a function").
        manualChunks: (id) => (/node_modules\/(react|react-dom|scheduler)\//.test(id) ? 'react' : undefined),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Nova OS',
        short_name: 'Nova OS',
        description: 'Personal AI operating system — mission control, voice, memory galaxy, agents and vault.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#06070d',
        theme_color: '#06070d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // long-press the app icon → jump straight to capture or the deck
        shortcuts: [
          { name: 'Capture to Inbox', short_name: 'Capture', url: './#/inbox', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Mission Control', short_name: 'Mission', url: './#/mission', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        importScripts: ['push-sw.js'], // web-push + notification-click handlers
        // Offline cold start. Without a navigate fallback the browser asks
        // for the page URL, the service worker has no route for it, and the
        // app opens to a WHITE SCREEN — his report, and the reason Nova has
        // never behaved like an installed app. index.html is precached; this
        // is what actually serves it to a navigation request.
        navigateFallback: '/nova-os/index.html',
        // never swallow API calls — they must fail honestly so the app can
        // fall back to its cached slices and the Outbox can queue writes
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
