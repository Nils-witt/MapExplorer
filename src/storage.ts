import type { LocalMarker, MapPosition, Overlay } from './types';

const STYLE_URL_STORAGE_KEY = 'mapexplorer.styleUrl';
const OVERLAYS_STORAGE_KEY = 'mapexplorer.overlays';
const SERVER_URL_STORAGE_KEY = 'mapexplorer.serverBaseUrl';
const SERVER_USERNAME_STORAGE_KEY = 'mapexplorer.serverUsername';
const SERVER_TOKEN_STORAGE_KEY = 'mapexplorer.serverToken';
const MAP_POSITION_STORAGE_KEY = 'mapexplorer.mapPosition';
const MARKERS_STORAGE_KEY = 'mapexplorer.markers';

function readValue(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeValue(key: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable (e.g. private browsing) - skip persistence
  }
}

export function applyConfig(config: {
  defaultStyleUrl?: string;
  defaultOverlaysServer?: string;
}): void {
  let modified = false;
  if (config.defaultStyleUrl && config.defaultStyleUrl !== loadStyleUrl('')) {
    saveStyleUrl(config.defaultStyleUrl);
    modified = true;
  }
  if (
    config.defaultOverlaysServer &&
    config.defaultOverlaysServer !== loadServerBaseUrl('')
  ) {
    saveServerBaseUrl(config.defaultOverlaysServer);
    modified = true;
  }
  if (modified) {
    window.location.reload();
  }
}

export function loadStyleUrl(defaultStyleUrl: string): string {
  return readValue(STYLE_URL_STORAGE_KEY, defaultStyleUrl);
}

export function saveStyleUrl(url: string): void {
  writeValue(STYLE_URL_STORAGE_KEY, url);
}

export function loadOverlays(): Overlay[] {
  const stored = readValue(OVERLAYS_STORAGE_KEY);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOverlays(overlays: Overlay[]): void {
  writeValue(OVERLAYS_STORAGE_KEY, JSON.stringify(overlays));
}

export function loadServerBaseUrl(defaultBaseUrl: string): string {
  return readValue(SERVER_URL_STORAGE_KEY, defaultBaseUrl);
}

export function saveServerBaseUrl(url: string): void {
  writeValue(SERVER_URL_STORAGE_KEY, url);
}

export function loadServerUsername(): string {
  return readValue(SERVER_USERNAME_STORAGE_KEY);
}

export function saveServerUsername(username: string): void {
  writeValue(SERVER_USERNAME_STORAGE_KEY, username);
}

export function loadServerToken(): string {
  return readValue(SERVER_TOKEN_STORAGE_KEY);
}

export function saveServerToken(token: string): void {
  writeValue(SERVER_TOKEN_STORAGE_KEY, token);
}

function isMapPosition(value: unknown): value is MapPosition {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.center) &&
    candidate.center.length === 2 &&
    typeof candidate.center[0] === 'number' &&
    typeof candidate.center[1] === 'number' &&
    typeof candidate.zoom === 'number' &&
    typeof candidate.bearing === 'number' &&
    typeof candidate.pitch === 'number'
  );
}

export function loadMapPosition(): MapPosition | null {
  const stored = readValue(MAP_POSITION_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored);
    return isMapPosition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMapPosition(position: MapPosition): void {
  writeValue(MAP_POSITION_STORAGE_KEY, JSON.stringify(position));
}

function isLocalMarker(value: unknown): value is LocalMarker {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.lng === 'number' &&
    typeof candidate.lat === 'number' &&
    typeof candidate.name === 'string'
  );
}

export function loadMarkers(): LocalMarker[] {
  const stored = readValue(MARKERS_STORAGE_KEY);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isLocalMarker) : [];
  } catch {
    return [];
  }
}

export function saveMarkers(markers: LocalMarker[]): void {
  writeValue(MARKERS_STORAGE_KEY, JSON.stringify(markers));
}
