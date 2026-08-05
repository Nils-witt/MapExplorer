import type { Overlay } from './types';

export const OVERLAY_SOURCE_PREFIX = 'overlay-source-';
export const OVERLAY_LAYER_PREFIX = 'overlay-layer-';
export const DEFAULT_OVERLAY_OPACITY = 0.8;

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
