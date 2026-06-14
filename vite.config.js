import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/DiceProbabilityEngine/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // two pages: the playground (index) and the DSL reference (docs)
      input: { main: 'index.html', docs: 'docs.html' },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'robots.txt', 'sitemap.xml'],
      manifest: {
        name: 'DiceScript — Dice Probability Engine',
        short_name: 'DiceScript',
        description: 'Write a dice roll once; get a sampled result or the full probability distribution.',
        start_url: '/DiceProbabilityEngine/',
        scope: '/DiceProbabilityEngine/',
        display: 'standalone',
        background_color: '#0e0e10',
        theme_color: '#0e0e10',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // precache the built app so it works offline / installs as a web app
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,ttf}'],
        globIgnores: ['**/*.worker-*.js'],                // skip Monaco's heavy workers (6.9 MB ts.worker)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,   // the main Monaco bundle is ~3.7 MB
        runtimeCaching: [
          {
            // cache the Monaco workers on first use instead of at install
            urlPattern: /\.worker-[^/]*\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'monaco-workers', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});
