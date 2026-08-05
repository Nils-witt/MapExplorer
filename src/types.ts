export interface Overlay {
  id: string;
  name: string;
  tiles: string[];
  enabled: boolean;
  authorizationHeader?: string;
  opacity?: number;
}

export interface MapPosition {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}
