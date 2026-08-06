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
}

export interface MapPosition {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface LocalMarker {
  id: string;
  lng: number;
  lat: number;
  name: string;
}
