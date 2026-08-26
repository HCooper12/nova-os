import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

// THE BUILD STAMP — the thing that ends "is my phone even running your fix?"
//
// registerType is 'autoUpdate', which sounds like it means "always current"
// and does not: the service worker fetches a new build in the background,
// but the RUNNING app keeps its old JavaScript until a full reload. In an
// installed PWA that is never properly closed, that can be days. Every
// "I shipped it" / "it isn't there" round trip in this project traces back
// to that gap.
//
// So the build id is compiled INTO the bundle and also written to a tiny
// version.json beside it. The app compares the two and can say, out loud,
// "you are running an old Nova — tap to update". No guessing, from either
// side of the conversation.
// FROM THE COMMIT, NOT THE CLOCK. A timestamp is regenerated when CI builds
// the same commit, so the local and deployed ids could never match and the
// check was unfalsifiable. The commit sha is the same on both machines.
const BUILD_ID = (() => {
  try {
    return execSync('git rev-parse --short=9 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return `dev-${Date.now().toString(36)}`;
  }
})();
function buildStamp() {
  return {
    name: 'nova-build-stamp',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/version.json', JSON.stringify({ buildId: BUILD_ID }), 'utf8');
    },
  };
}

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
  define: { __NOVA_BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    buildStamp(),
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
        // the freshness oracle itself can never be served from cache
        navigateFallbackDenylist: [/^\/nova-os\/version\.json$/],
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
