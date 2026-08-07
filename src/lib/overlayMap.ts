import type { Overlay } from './types';
import type { ServerConnection } from './storage';

export const OVERLAY_SOURCE_PREFIX = 'overlay-source-';
export const OVERLAY_LAYER_PREFIX = 'overlay-layer-';
export const DEFAULT_OVERLAY_OPACITY = 0.8;

export function tileUrlPrefix(template: string): string {
  return template.split('{')[0];
}

// Overlays added from a server carry a `serverId` relation instead of a
// frozen header, so the token is always read live from the current server
// connection rather than the (possibly expired) value captured at add time.
export function resolveOverlayAuthorizationHeader(
  overlay: Overlay,
  servers: ServerConnection[],
): string | undefined {
  if (overlay.serverId) {
    const server = servers.find(
      (candidate) => candidate.id === overlay.serverId,
    );
    return server?.token ? `Bearer ${server.token}` : undefined;
  }
  return overlay.authorizationHeader;
}

export function findAuthorizationHeader(
  url: string,
  overlays: Overlay[],
  servers: ServerConnection[],
): string | undefined {
  const overlay = overlays.find(
    (candidate) =>
      candidate.enabled &&
      candidate.tiles.some((tile) => url.startsWith(tileUrlPrefix(tile))),
  );
  if (!overlay) {
    return undefined;
  }
  return resolveOverlayAuthorizationHeader(overlay, servers);
}
