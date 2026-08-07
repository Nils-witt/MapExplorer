import type { Overlay } from './types';
import type { ServerConnection } from './storage';
import { resolveOverlayAuthorizationHeader } from './overlayMap';
import { fetchTileManifest, type CacheOverlayResult } from './tileCache';

export interface ZoomRange {
  minZoom: number;
  maxZoom: number;
}

// The zoom band background caching defaults to: coarse enough to stay a
// reasonable download, detailed enough to be useful without a connection.
export const DEFAULT_CACHE_ZOOM_RANGE: ZoomRange = { minZoom: 8, maxZoom: 14 };

export interface LngLatBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

// Must match the `cacheName` of the tile runtimeCaching route in
// vite.config.ts, so tiles pre-cached here are what the CacheFirst strategy
// finds the next time the map requests them - including offline.
const RUNTIME_TILE_CACHE_NAME = 'map-tiles-cache';
const CONCURRENCY = 6;

function tileLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function expandBounds(
  bounds: LngLatBounds | null,
  lon: number,
  lat: number,
): LngLatBounds {
  if (!bounds) {
    return { minLon: lon, maxLon: lon, minLat: lat, maxLat: lat };
  }
  return {
    minLon: Math.min(bounds.minLon, lon),
    maxLon: Math.max(bounds.maxLon, lon),
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
  };
}

// Computes the geographic envelope of every overlay's known tiles (from
// each overlay's server manifest), so background style tiles can be
// pre-cached for the area the overlays cover instead of the whole world.
export async function overlaysBoundingBox(
  overlays: Overlay[],
  servers: ServerConnection[],
): Promise<LngLatBounds | null> {
  let bounds: LngLatBounds | null = null;
  for (const overlay of overlays) {
    const template = overlay.tiles[0];
    if (!template) {
      continue;
    }
    const header = resolveOverlayAuthorizationHeader(overlay, servers);
    const tiles = await fetchTileManifest(template, header);
    for (const tile of tiles) {
      bounds = expandBounds(
        bounds,
        tileLon(tile.x, tile.z),
        tileLat(tile.y + 1, tile.z),
      );
      bounds = expandBounds(
        bounds,
        tileLon(tile.x + 1, tile.z),
        tileLat(tile.y, tile.z),
      );
    }
  }
  return bounds;
}

interface StyleSourceDef {
  type: string;
  tiles?: string[];
  url?: string;
  minzoom?: number;
  maxzoom?: number;
}

interface TileJson {
  tiles?: string[];
  minzoom?: number;
  maxzoom?: number;
}

interface StyleTileSource {
  template: string;
  minzoom: number;
  maxzoom: number;
}

// The style's own map layers (as opposed to overlays) live in these source
// types; geojson/image/video sources aren't tile-based and are skipped.
const TILE_SOURCE_TYPES = new Set(['vector', 'raster', 'raster-dem']);

async function resolveSourceTemplate(
  source: StyleSourceDef,
): Promise<StyleTileSource | null> {
  if (source.tiles?.[0]) {
    return {
      template: source.tiles[0],
      minzoom: source.minzoom ?? 0,
      maxzoom: source.maxzoom ?? 22,
    };
  }
  if (source.url) {
    const response = await fetch(source.url);
    if (!response.ok) {
      return null;
    }
    const tileJson: TileJson = await response.json();
    if (!tileJson.tiles?.[0]) {
      return null;
    }
    return {
      template: tileJson.tiles[0],
      minzoom: tileJson.minzoom ?? source.minzoom ?? 0,
      maxzoom: tileJson.maxzoom ?? source.maxzoom ?? 22,
    };
  }
  return null;
}

// Resolves every tile-based source in a MapLibre style document into a
// fetchable tile URL template, dereferencing TileJSON `url` references.
export async function resolveStyleTileSources(
  styleUrl: string,
): Promise<StyleTileSource[]> {
  const response = await fetch(styleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load style: ${response.status}`);
  }
  const style: { sources?: Record<string, StyleSourceDef> } =
    await response.json();
  const sources = Object.values(style.sources ?? {}).filter((source) =>
    TILE_SOURCE_TYPES.has(source.type),
  );
  const resolved = await Promise.all(sources.map(resolveSourceTemplate));
  return resolved.filter(
    (source): source is StyleTileSource => source !== null,
  );
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const clamped = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const latRad = (clamped * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      2 ** z,
  );
}

interface Tile {
  z: number;
  x: number;
  y: number;
}

function tilesForZoom(bounds: LngLatBounds, z: number): Tile[] {
  const maxIndex = 2 ** z - 1;
  const clampIndex = (value: number) => Math.max(0, Math.min(maxIndex, value));
  const x0 = clampIndex(lonToTileX(bounds.minLon, z));
  const x1 = clampIndex(lonToTileX(bounds.maxLon, z));
  const y0 = clampIndex(latToTileY(bounds.maxLat, z));
  const y1 = clampIndex(latToTileY(bounds.minLat, z));
  const tiles: Tile[] = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

function tileUrl(template: string, tile: Tile): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}

// Downloads every background-style tile covering `bounds` for the given
// zoom range into the same cache the runtime CacheFirst tile route reads
// from, so the base map keeps rendering offline within that area.
export async function cacheStyleTiles(
  styleUrl: string,
  bounds: LngLatBounds,
  zoomRange: ZoomRange,
  onProgress?: (done: number, total: number) => void,
): Promise<CacheOverlayResult> {
  const sources = await resolveStyleTileSources(styleUrl);
  const tiles = sources.flatMap((source) => {
    const minZoom = Math.max(zoomRange.minZoom, source.minzoom);
    const maxZoom = Math.min(zoomRange.maxZoom, source.maxzoom);
    const tilesForSource: Tile[] = [];
    for (let z = minZoom; z <= maxZoom; z++) {
      tilesForSource.push(...tilesForZoom(bounds, z));
    }
    return tilesForSource.map((tile) => ({ template: source.template, tile }));
  });

  const cache = await caches.open(RUNTIME_TILE_CACHE_NAME);

  let nextIndex = 0;
  let done = 0;
  let cached = 0;
  let failed = 0;

  const worker = async () => {
    while (nextIndex < tiles.length) {
      const { template, tile } = tiles[nextIndex++];
      const url = tileUrl(template, tile);
      try {
        const response = await fetch(url);
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
