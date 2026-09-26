import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { rolldown } from 'rolldown';

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

const CUSTOM_SW_ENTRY = 'src/sw/custom.ts';
const CUSTOM_SW_FILE = 'sw-custom.js';

async function bundleCustomServiceWorker(minify: boolean): Promise<string> {
  const bundle = await rolldown({ input: CUSTOM_SW_ENTRY });
  try {
    const { output } = await bundle.generate({ format: 'iife', minify });
    return output[0].code;
  } finally {
    await bundle.close();
  }
}

// Compiles the custom service worker code (TypeScript) into a classic script
// at /sw-custom.js, which the Workbox-generated sw.js pulls in via
// importScripts. Served on the fly in dev, emitted as an asset in builds.
function customServiceWorker(): Plugin {
  let minify = false;
  return {
    name: 'custom-service-worker',
    configResolved(config) {
      minify = !!config.build.minify;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== `/${CUSTOM_SW_FILE}`) return next();
        try {
          const code = await bundleCustomServiceWorker(false);
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(code);
        } catch (err) {
          next(err);
        }
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: CUSTOM_SW_FILE,
        source: await bundleCustomServiceWorker(minify),
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __GIT_COMMIT__: JSON.stringify(getGitCommit()),
  },
  plugins: [
    react(),
    customServiceWorker(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      devOptions: {
        enabled: false,
        navigateFallback: 'index.html',
        // Nothing is built in dev, so the precache glob never matches.
        suppressWarnings: true,
      },
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
        // Custom SW code compiled from src/sw/custom.ts, see customServiceWorker.
        importScripts: [CUSTOM_SW_FILE],
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/config\.json/],
        runtimeCaching: [
          {
            // vector map tiles, e.g. .../{z}/{x}/{y}.pbf
            // A plain RegExp route only matches cross-origin URLs when the
            // match starts at index 0, which tile URLs never do - so this
            // must be a function matcher instead of a bare RegExp.
            urlPattern: ({ url }) =>
              /\/\d{1,2}\/\d{1,8}\/\d{1,8}(\.pbf)$/.test(url.href),
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
            // Raster/map tiles, e.g. .../{z}/{x}/{y}.png
            // A plain RegExp route only matches cross-origin URLs when the
            // match starts at index 0, which tile URLs never do - so this
            // must be a function matcher instead of a bare RegExp.
            urlPattern: ({ url }) =>
              /\/\d{1,2}\/\d{1,8}\/\d{1,8}(\.png)$/.test(url.href),
            handler: 'CacheFirst',
            options: {
              cacheName: 'overlay-tiles-cache',
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
              plugins: [
                {
                  // Overlays cached from the settings live in caches of
                  // their own (`<server id>-<map uuid>-<version>`), so fall
                  // back to searching every cache before hitting the network.
                  cachedResponseWillBeUsed: async ({
                    cachedResponse,
                    request,
                  }) => cachedResponse ?? (await caches.match(request)) ?? null,
                },
              ],
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
