export interface ConnectedServer {
  id: string;
  baseUrl: string;
  name: string;
  // Unset (as for servers stored before this existed) means enabled.
  enabled?: boolean;
}

// Disabled servers stay in the list but aren't fetched from or drawn.
export function isServerEnabled(server: ConnectedServer): boolean {
  return server.enabled !== false;
}

export interface MapPosition {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}
