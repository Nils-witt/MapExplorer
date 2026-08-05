import type { Overlay } from './types';

const STYLE_URL_STORAGE_KEY = 'mapexplorer.styleUrl';
const OVERLAYS_STORAGE_KEY = 'mapexplorer.overlays';
const SERVER_URL_STORAGE_KEY = 'mapexplorer.serverBaseUrl';
const SERVER_USERNAME_STORAGE_KEY = 'mapexplorer.serverUsername';
const SERVER_TOKEN_STORAGE_KEY = 'mapexplorer.serverToken';

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
