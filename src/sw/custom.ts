/// <reference lib="webworker" />
// Custom service worker logic, compiled to /sw-custom.js by the
// customServiceWorker plugin in vite.config.ts and loaded into the
// Workbox-generated service worker via `workbox.importScripts`. Runs in the
// service worker global scope, before Workbox registers its own routes.

declare let self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PING') {
    event.ports[0]?.postMessage({ type: 'PONG' });
  }
});

const overlayRequestPattern =
  /\/maps\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/version\/(\d{1,2})\/\d{1,2}\/\d{1,8}\/\d{1,8}(\.png)$/;

self.addEventListener('fetch', function (event) {
  const url = event.request.url;
  if (overlayRequestPattern.test(url)) {
    event.preventDefault();
    event.stopPropagation();

    const matches = url.match(overlayRequestPattern);

    if (matches) {
      const mapUuid = matches[1];
      const version = matches[2];

      const cacheName = `${mapUuid}-${version}`;
      event.respondWith(
        caches.open(cacheName).then((cache) => {
          return cache.match(event.request).then((response) => {
            if (response) {
              return response;
            } else {
              return fetch(event.request).then((networkResponse) => {
                if (networkResponse.ok) {
                  cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
              });
            }
          });
        }),
      );
    }
  }
});
