import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Overlay } from './types';

const OVERLAY_SOURCE_PREFIX = 'overlay-source-';
const OVERLAY_LAYER_PREFIX = 'overlay-layer-';
export const DEFAULT_OVERLAY_OPACITY = 0.8;

export function applyOverlays(map: MapLibreMap, overlays: Overlay[]): void {
  const style = map.getStyle();
  if (!style) {
    return;
  }

  const existingOverlayLayerIds = (style.layers ?? [])
    .map((layer) => layer.id)
    .filter((id) => id.startsWith(OVERLAY_LAYER_PREFIX));

  for (const layerId of existingOverlayLayerIds) {
    const overlayId = layerId.slice(OVERLAY_LAYER_PREFIX.length);
    const overlay = overlays.find((candidate) => candidate.id === overlayId);
    if (!overlay?.enabled) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      const sourceId = `${OVERLAY_SOURCE_PREFIX}${overlayId}`;
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }
  }

  for (const overlay of overlays) {
    if (!overlay.enabled) {
      continue;
    }

    const sourceId = `${OVERLAY_SOURCE_PREFIX}${overlay.id}`;
    const layerId = `${OVERLAY_LAYER_PREFIX}${overlay.id}`;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: overlay.tiles,
        tileSize: 256,
      });
    }

    const opacity = overlay.opacity ?? DEFAULT_OVERLAY_OPACITY;

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': opacity },
      });
    } else {
      map.setPaintProperty(layerId, 'raster-opacity', opacity);
    }
  }

  // Enforce stacking order: overlays earlier in the list are drawn on top.
  // Moving each layer to the top in reverse-list order leaves the first
  // overlay on top once every layer has been placed.
  for (const overlay of [...overlays].reverse()) {
    if (!overlay.enabled) {
      continue;
    }
    const layerId = `${OVERLAY_LAYER_PREFIX}${overlay.id}`;
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  }
}

export function tileUrlPrefix(template: string): string {
  return template.split('{')[0];
}

export function findAuthorizationHeader(
  url: string,
  overlays: Overlay[],
): string | undefined {
  const overlay = overlays.find(
    (candidate) =>
      candidate.enabled &&
      candidate.authorizationHeader &&
      candidate.tiles.some((tile) => url.startsWith(tileUrlPrefix(tile))),
  );
  return overlay?.authorizationHeader;
}
