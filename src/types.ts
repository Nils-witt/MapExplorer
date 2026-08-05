export interface Overlay {
  id: string;
  name: string;
  tiles: string[];
  enabled: boolean;
  authorizationHeader?: string;
}
