import type {
  GeoObjectEntry,
  LegacyLocalMarker,
  MapPosition,
  Overlay,
} from '../types';

const STYLE_URL_STORAGE_KEY = 'mapexplorer.styleUrl';
const OVERLAYS_STORAGE_KEY = 'mapexplorer.overlays';
const DEFAULT_SERVER_URL_STORAGE_KEY = 'mapexplorer.serverBaseUrl';
const SERVERS_STORAGE_KEY = 'mapexplorer.servers';
const LEGACY_SERVER_USERNAME_STORAGE_KEY = 'mapexplorer.serverUsername';
const LEGACY_SERVER_TOKEN_STORAGE_KEY = 'mapexplorer.serverToken';
const LEGACY_SERVER_REFRESH_TOKEN_STORAGE_KEY =
  'mapexplorer.serverRefreshToken';
const MAP_POSITION_STORAGE_KEY = 'mapexplorer.mapPosition';
const MARKERS_STORAGE_KEY = 'mapexplorer.markers';
const SHOW_MARKER_LABELS_STORAGE_KEY = 'mapexplorer.showMarkerLabels';
const SHOW_ALL_MARKERS_STORAGE_KEY = 'mapexplorer.showAllMarkers';
const ACTIVE_OVERLAY_ID_STORAGE_KEY = 'mapexplorer.activeOverlayId';

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

// Markers, overlays and servers can grow large (imported CSVs, many tile
// layers) so they live in IndexedDB rather than localStorage. Everything
// else here is small config and stays in localStorage for simplicity.
const IDB_DATABASE_NAME = 'mapexplorer';
const IDB_DATABASE_VERSION = 3;

// Legacy object store from schema v1: each of markers/overlays/servers was
// kept as a single serialized array under one key. Still opened (read-only,
// for one-time migration) so upgrades from v1 don't lose data.
const IDB_KV_STORE_NAME = 'kv';

// Legacy table from before local markers were replaced by server-backed
// GeoObjects. Kept read-only, purely so any markers a user placed before the
// upgrade can be offered for one-time migration onto a server map.
const MARKERS_TABLE_NAME = 'markers';
const OVERLAYS_TABLE_NAME = 'overlays';
const SERVERS_TABLE_NAME = 'servers';
const GEO_OBJECTS_TABLE_NAME = 'geoObjects';
const GEO_OBJECTS_OVERLAY_INDEX_NAME = 'overlayId';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_KV_STORE_NAME)) {
        db.createObjectStore(IDB_KV_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(MARKERS_TABLE_NAME)) {
        db.createObjectStore(MARKERS_TABLE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(OVERLAYS_TABLE_NAME)) {
        db.createObjectStore(OVERLAYS_TABLE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SERVERS_TABLE_NAME)) {
        db.createObjectStore(SERVERS_TABLE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(GEO_OBJECTS_TABLE_NAME)) {
        const geoObjectsStore = db.createObjectStore(GEO_OBJECTS_TABLE_NAME, {
          keyPath: 'geoObject.uuid',
        });
        geoObjectsStore.createIndex(
          GEO_OBJECTS_OVERLAY_INDEX_NAME,
          'overlayId',
        );
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(IDB_KV_STORE_NAME, 'readonly');
      const request = transaction.objectStore(IDB_KV_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

async function kvDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(IDB_KV_STORE_NAME, 'readwrite');
      transaction.objectStore(IDB_KV_STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // IndexedDB unavailable (e.g. private browsing) - skip persistence
  }
}

async function tableGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDb();
    return await new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

// Replaces the full contents of a table in one transaction: clears every
// row, then re-inserts the given records keyed by their `id`.
async function tableReplaceAll<T extends { id: string }>(
  storeName: string,
  records: T[],
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // IndexedDB unavailable (e.g. private browsing) - skip persistence
  }
}

// Object stores return rows in primary-key order, not insertion or list
// order, so list order (e.g. overlay layering) is kept in an explicit
// `order` column that's added on the way in and stripped on the way out.
async function tableGetAllOrdered<T extends { id: string }>(
  storeName: string,
): Promise<T[]> {
  const stored = await tableGetAll<T & { order: number }>(storeName);
  return stored
    .sort((a, b) => a.order - b.order)
    .map((record) => {
      const rest: Record<string, unknown> = { ...record };
      delete rest.order;
      return rest as T;
    });
}

async function tableReplaceAllOrdered<T extends { id: string }>(
  storeName: string,
  records: T[],
): Promise<void> {
  await tableReplaceAll(
    storeName,
    records.map((record, index) => ({ ...record, order: index })),
  );
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
    config.defaultOverlaysServer !== loadDefaultServerUrl('')
  ) {
    saveDefaultServerUrl(config.defaultOverlaysServer);
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

// Installs from before overlays moved to IndexedDB kept them as a JSON blob
// in localStorage under the same key. Fold that in once, then drop it.
function migrateLegacyOverlays(): Overlay[] {
  const stored = readValue(OVERLAYS_STORAGE_KEY);
  writeValue(OVERLAYS_STORAGE_KEY, '');
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

// Installs from before overlays moved to the `overlays` table kept the list
// as a single JSON blob under one key in the old `kv` store. Fold that in
// once (falling back to the even older localStorage blob), then drop it.
async function migrateOverlaysToTable(): Promise<Overlay[]> {
  const stored = await kvGet<Overlay[]>(OVERLAYS_STORAGE_KEY);
  if (stored !== undefined) {
    await kvDelete(OVERLAYS_STORAGE_KEY);
    return Array.isArray(stored) ? stored : [];
  }
  return migrateLegacyOverlays();
}

export async function loadOverlays(): Promise<Overlay[]> {
  const stored = await tableGetAllOrdered<Overlay>(OVERLAYS_TABLE_NAME);
  if (stored.length > 0) {
    return stored;
  }
  const migrated = await migrateOverlaysToTable();
  if (migrated.length > 0) {
    await saveOverlays(migrated);
  }
  return migrated;
}

export async function saveOverlays(overlays: Overlay[]): Promise<void> {
  await tableReplaceAllOrdered(OVERLAYS_TABLE_NAME, overlays);
}

// Base URL suggested by config.json for a fresh install, used to prefill
// the first server a user adds. Not tied to any particular connection.
export function loadDefaultServerUrl(defaultBaseUrl = ''): string {
  return readValue(DEFAULT_SERVER_URL_STORAGE_KEY, defaultBaseUrl);
}

export function saveDefaultServerUrl(url: string): void {
  writeValue(DEFAULT_SERVER_URL_STORAGE_KEY, url);
}

export interface ServerConnection {
  id: string;
  baseUrl: string;
  username: string;
  token: string;
  refreshToken: string;
}

function isServerConnection(value: unknown): value is ServerConnection {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.baseUrl === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.token === 'string' &&
    typeof candidate.refreshToken === 'string'
  );
}

// Installs from before multi-server support kept a single connection under
// separate keys. Fold it into the new list once, then drop the legacy keys.
function migrateLegacyServer(): ServerConnection[] {
  const baseUrl = loadDefaultServerUrl();
  const token = readValue(LEGACY_SERVER_TOKEN_STORAGE_KEY);
  const username = readValue(LEGACY_SERVER_USERNAME_STORAGE_KEY);
  const refreshToken = readValue(LEGACY_SERVER_REFRESH_TOKEN_STORAGE_KEY);
  writeValue(LEGACY_SERVER_USERNAME_STORAGE_KEY, '');
  writeValue(LEGACY_SERVER_TOKEN_STORAGE_KEY, '');
  writeValue(LEGACY_SERVER_REFRESH_TOKEN_STORAGE_KEY, '');
  if (!baseUrl && !token) {
    return [];
  }
  return [{ id: 'legacy', baseUrl, username, token, refreshToken }];
}

// Installs from before servers moved to IndexedDB kept the multi-server
// list as a JSON blob in localStorage under the same key. Fold that in
// once (falling back to the even older single-connection keys), then drop it.
function migrateLegacyServers(): ServerConnection[] {
  const stored = readValue(SERVERS_STORAGE_KEY);
  writeValue(SERVERS_STORAGE_KEY, '');
  if (!stored) {
    return migrateLegacyServer();
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isServerConnection) : [];
  } catch {
    return [];
  }
}

// Installs from before servers moved to the `servers` table kept the list as
// a single JSON blob under one key in the old `kv` store. Fold that in once
// (falling back to the even older localStorage-only formats), then drop it.
async function migrateServersToTable(): Promise<ServerConnection[]> {
  const stored = await kvGet<ServerConnection[]>(SERVERS_STORAGE_KEY);
  if (stored !== undefined) {
    await kvDelete(SERVERS_STORAGE_KEY);
    return Array.isArray(stored) ? stored.filter(isServerConnection) : [];
  }
  return migrateLegacyServers();
}

export async function loadServers(): Promise<ServerConnection[]> {
  const stored = await tableGetAllOrdered<ServerConnection>(SERVERS_TABLE_NAME);
  if (stored.length > 0) {
    return stored.filter(isServerConnection);
  }
  const migrated = await migrateServersToTable();
  if (migrated.length > 0) {
    await saveServers(migrated);
  }
  return migrated;
}

export async function saveServers(servers: ServerConnection[]): Promise<void> {
  await tableReplaceAllOrdered(SERVERS_TABLE_NAME, servers);
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

function isLegacyLocalMarker(value: unknown): value is LegacyLocalMarker {
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

// Installs from before markers moved to IndexedDB kept them as a JSON blob
// in localStorage under the same key. Fold that in once, then drop it.
function migrateLegacyMarkersFromLocalStorage(): LegacyLocalMarker[] {
  const stored = readValue(MARKERS_STORAGE_KEY);
  writeValue(MARKERS_STORAGE_KEY, '');
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isLegacyLocalMarker) : [];
  } catch {
    return [];
  }
}

// Installs from before markers moved to the `markers` table kept them as a
// single JSON blob under one key in the old `kv` store. Fold that in once
// (falling back to the even older localStorage blob), then drop it.
async function migrateLegacyMarkersToTable(): Promise<LegacyLocalMarker[]> {
  const stored = await kvGet<LegacyLocalMarker[]>(MARKERS_STORAGE_KEY);
  if (stored !== undefined) {
    await kvDelete(MARKERS_STORAGE_KEY);
    return Array.isArray(stored) ? stored.filter(isLegacyLocalMarker) : [];
  }
  return migrateLegacyMarkersFromLocalStorage();
}

// Local markers were retired in favor of server-backed GeoObjects. This only
// reads whatever's left in the old `markers` table (folding in any
// even-older storage formats first) so the app can offer a one-time
// migration onto a chosen server map; nothing writes to this table anymore
// outside of that fold-in.
export async function loadLegacyMarkers(): Promise<LegacyLocalMarker[]> {
  const stored =
    await tableGetAllOrdered<LegacyLocalMarker>(MARKERS_TABLE_NAME);
  if (stored.length > 0) {
    return stored.filter(isLegacyLocalMarker);
  }
  const migrated = await migrateLegacyMarkersToTable();
  if (migrated.length > 0) {
    await tableReplaceAllOrdered(MARKERS_TABLE_NAME, migrated);
  }
  return migrated;
}

export async function clearLegacyMarkers(): Promise<void> {
  await tableReplaceAllOrdered(MARKERS_TABLE_NAME, []);
}

// Rewrites the legacy table to hold exactly these markers - used after a
// partial migration so already-succeeded markers aren't left behind to be
// re-migrated (and duplicated) on the next attempt.
export async function saveLegacyMarkers(
  markers: LegacyLocalMarker[],
): Promise<void> {
  await tableReplaceAllOrdered(MARKERS_TABLE_NAME, markers);
}

export async function loadCachedGeoObjects(): Promise<GeoObjectEntry[]> {
  return tableGetAll<GeoObjectEntry>(GEO_OBJECTS_TABLE_NAME);
}

// Replaces every cached GeoObject row for a single overlay, leaving other
// overlays' cached rows untouched - the source of truth for "what does this
// overlay currently show" is always the last successful fetch or mutation.
export async function saveGeoObjectsForOverlay(
  overlayId: string,
  entries: GeoObjectEntry[],
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(GEO_OBJECTS_TABLE_NAME, 'readwrite');
      const store = transaction.objectStore(GEO_OBJECTS_TABLE_NAME);
      const index = store.index(GEO_OBJECTS_OVERLAY_INDEX_NAME);
      const cursorRequest = index.openCursor(IDBKeyRange.only(overlayId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          entries.forEach((entry) => store.put(entry));
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // IndexedDB unavailable (e.g. private browsing) - skip persistence
  }
}

export function loadActiveOverlayId(): string | null {
  return readValue(ACTIVE_OVERLAY_ID_STORAGE_KEY) || null;
}

export function saveActiveOverlayId(id: string | null): void {
  writeValue(ACTIVE_OVERLAY_ID_STORAGE_KEY, id ?? '');
}

export function loadShowMarkerLabels(): boolean {
  return readValue(SHOW_MARKER_LABELS_STORAGE_KEY) === 'true';
}

export function saveShowMarkerLabels(show: boolean): void {
  writeValue(SHOW_MARKER_LABELS_STORAGE_KEY, show ? 'true' : '');
}

export function loadShowAllMarkers(): boolean {
  const stored = readValue(SHOW_ALL_MARKERS_STORAGE_KEY);
  return stored === '' ? false : stored === 'true';
}

export function saveShowAllMarkers(show: boolean): void {
  writeValue(SHOW_ALL_MARKERS_STORAGE_KEY, show ? 'true' : 'false');
}
