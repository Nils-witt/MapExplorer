import { OverlayServer } from '../api/OverlayServer.ts';

export interface CacheOverlayResult {
  cached: number;
  failed: number;
  total: number;
}

const CONCURRENCY = 6;

export function isTileCacheSupported(): boolean {
  return typeof caches !== 'undefined';
}

// Each overlay version gets a cache of its own, so it survives the shared
// runtime tile cache's eviction and old versions never mix with new ones.
export function overlayCacheName(mapUuid: string, version: string): string {
  return `${mapUuid}-${version}`;
}

export async function isOverlayCached(
  mapUuid: string,
  version: string,
): Promise<boolean> {
  return caches.has(overlayCacheName(mapUuid, version));
}

// Downloads every tile listed in the version's manifest into its cache.
export async function cacheOverlayTiles(
  serverId: string,
  baseUrl: string,
  accessToken: string | null,
  mapUuid: string,
  version: string,
  onProgress?: (done: number, total: number) => void,
): Promise<CacheOverlayResult> {
  const server = new OverlayServer(baseUrl, () => accessToken);
  const tiles = await server.listTiles(mapUuid, version);
  const cache = await caches.open(overlayCacheName(mapUuid, version));
  const init = accessToken
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : undefined;

  let nextIndex = 0;
  let done = 0;
  let cached = 0;
  let failed = 0;

  const worker = async () => {
    while (nextIndex < tiles.length) {
      const url = server.tileUrl(mapUuid, version, tiles[nextIndex++]);
      try {
        const response = await fetch(url, init);
        if (response.ok) {
          await cache.put(url, response);
          cached++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      done++;
      onProgress?.(done, tiles.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker),
  );

  return { cached, failed, total: tiles.length };
}

// Deletes every cache except the service worker's precache of the app
// itself, which the app needs to start offline. Returns how many were
// deleted.
export async function deleteAllCaches(): Promise<number> {
  const names = (await caches.keys()).filter(
    (name) => !name.startsWith('workbox-precache'),
  );
  await Promise.all(names.map((name) => caches.delete(name)));
  return names.length;
}
