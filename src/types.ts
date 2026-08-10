import type { GeoObject } from './api/serverApi';

export interface Overlay {
  id: string;
  name: string;
  tiles: string[];
  enabled: boolean;
  authorizationHeader?: string;
  opacity?: number;
  // Id of the ServerConnection this overlay was added from, if any. When
  // set, the authorization header is resolved live from that server's
  // current token instead of the (possibly stale) `authorizationHeader`.
  serverId?: string;
  // Present only for overlays added from a server map. Identifies the map +
  // version whose GeoObjects should be fetched alongside this overlay's tiles.
  mapId?: string;
  mapVersion?: string;
  // When true, `mapVersion` (and the tile URL) stay fixed to a
  // user-chosen version instead of auto-following the server map's
  // `currentVersion` on resync.
  versionPinned?: boolean;
}

export interface MapPosition {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

// A fetched GeoObject plus the overlay/server/map it was fetched under, kept
// together so map/list rendering and cache rows don't need to re-resolve
// that provenance on every read.
export interface GeoObjectEntry {
  geoObject: GeoObject;
  overlayId: string;
  serverId: string;
  mapId: string;
  mapVersion: string;
  mapName: string;
  serverBaseUrl: string;
}

// Shape of a legacy local marker, kept only for the one-time migration path
// (reading old data out of the retired `markers` IndexedDB table).
export interface LegacyLocalMarker {
  id: string;
  lng: number;
  lat: number;
  name: string;
}
