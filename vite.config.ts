import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

function getGitCommit(): string {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function getAppVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync('git describe --tags --exact-match', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MapExplorer',
        short_name: 'MapExplorer',
        description: 'Explore maps with custom tile overlays, offline-capable.',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/config\.json/],
        runtimeCaching: [
          {
            // Raster/vector map tiles, e.g. .../{z}/{x}/{y}.png or .../{z}/{x}/{y}.pbf
            // A plain RegExp route only matches cross-origin URLs when the
            // match starts at index 0, which tile URLs never do - so this
            // must be a function matcher instead of a bare RegExp.
            urlPattern: ({ url }) =>
              /\/\d{1,2}\/\d{1,8}\/\d{1,8}(\.[a-zA-Z0-9]+)?(\?.*)?$/.test(
                url.href,
              ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                // Sized to comfortably hold a background-tile pre-cache
                // (zoom 8-14 over an overlay's area) alongside ordinary
                // browsing, so precached tiles aren't evicted by casual
                // panning elsewhere on the map.
                maxEntries: 20000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Map style documents, sprites and glyphs (fonts) for MapLibre styles
            urlPattern: ({ url, sameOrigin }) =>
              !sameOrigin &&
              (url.pathname.endsWith('.json') ||
                url.pathname.includes('sprite') ||
                /\/fonts\//.test(url.pathname)),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-style-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
});
