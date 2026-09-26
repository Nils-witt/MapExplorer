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

export interface CacheInfo {
  name: string;
  entries: number;
}

export async function listCaches(): Promise<CacheInfo[]> {
  const names = await caches.keys();
  return Promise.all(
    names.map(async (name) => {
      const cache = await caches.open(name);
      return { name, entries: (await cache.keys()).length };
    }),
  );
}

// Splits an overlay cache name back into its map uuid and version, or
// returns null for caches that don't hold an overlay version.
export function parseOverlayCacheName(
  name: string,
): { mapUuid: string; version: string } | null {
  const match = name.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d{1,2})$/,
  );
  return match ? { mapUuid: match[1], version: match[2] } : null;
}
