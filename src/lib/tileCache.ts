import type { Overlay } from './types';
import type { ServerConnection } from './storage';
import { resolveOverlayAuthorizationHeader, tileUrlPrefix } from './overlayMap';

export interface CacheOverlayResult {
  cached: number;
  failed: number;
  total: number;
}

export interface ManifestTile {
  z: number;
  x: number;
  y: number;
}

interface TileManifest {
  tiles: ManifestTile[];
}

const CACHE_NAME_PREFIX = 'overlay-tiles-';
const CONCURRENCY = 6;

// Folds the tile URL template into a short fingerprint so the cache name
// changes whenever the overlay's source (and therefore its version, which
// server maps embed in the URL) changes - stale versions are left behind
// under their own name rather than silently mixed into the new one.
function fingerprint(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function overlayCacheName(overlay: Overlay): string {
  return `${CACHE_NAME_PREFIX}${overlay.id}-${fingerprint(overlay.tiles.join('|'))}`;
}

// The tile URL template's directory (everything before the `{z}`
// placeholder, e.g. `.../maps/{id}/version/{version}/`) is also where the
// server publishes that map+version's tile manifest.
function manifestUrlForTemplate(template: string): string {
  return `${tileUrlPrefix(template)}index.json`;
}

function isTileManifest(value: unknown): value is TileManifest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const tiles = (value as Record<string, unknown>).tiles;
  return (
    Array.isArray(tiles) &&
    tiles.every(
      (tile) =>
        tile &&
        typeof tile === 'object' &&
        typeof (tile as Record<string, unknown>).z === 'number' &&
        typeof (tile as Record<string, unknown>).x === 'number' &&
        typeof (tile as Record<string, unknown>).y === 'number',
    )
  );
}

// The overlay server publishes a manifest of exactly which tiles exist for
// a map+version. Exported so callers that need the same underlying tile
// list for a different purpose (e.g. deriving a geographic extent) don't
// have to re-implement fetching and validating it.
export async function fetchTileManifest(
  template: string,
  header: string | undefined,
): Promise<ManifestTile[]> {
  const response = await fetch(
    manifestUrlForTemplate(template),
    header ? { headers: { Authorization: header } } : undefined,
  );
  if (!response.ok) {
    throw new Error(`Failed to load tile manifest: ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!isTileManifest(data)) {
    throw new Error('Tile manifest has an unexpected shape');
  }
  return data.tiles;
}

function tileUrl(template: string, tile: ManifestTile): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

export function isTileCacheSupported(): boolean {
  return typeof caches !== 'undefined';
}

// Downloads every tile listed in the server's manifest for this overlay's
// map+version into a cache dedicated to the overlay (and implicitly its
// version), so it survives independently of the shared runtime tile cache's
// eviction limits.
export async function cacheOverlayTiles(
  overlay: Overlay,
  servers: ServerConnection[],
  onProgress?: (done: number, total: number) => void,
): Promise<CacheOverlayResult> {
  const template = overlay.tiles[0];
  if (!template) {
    return { cached: 0, failed: 0, total: 0 };
  }

  const header = resolveOverlayAuthorizationHeader(overlay, servers);
  const tiles = await fetchTileManifest(template, header);
  const cache = await caches.open(overlayCacheName(overlay));

  let nextIndex = 0;
  let done = 0;
  let cached = 0;
  let failed = 0;

  const worker = async () => {
    while (nextIndex < tiles.length) {
      const url = tileUrl(template, tiles[nextIndex++]);
      try {
        const response = await fetch(
          url,
          header ? { headers: { Authorization: header } } : undefined,
        );
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
