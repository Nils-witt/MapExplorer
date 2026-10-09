import type { GeoJSON } from 'geojson';
import type {
  OverlayGeoObject,
  OverlayLayer,
  OverlayMap,
} from '../api/OverlayServer';
import type { AppConfig, MapStyle } from './config';
import type { ConnectedServer, MapPosition } from '../types';

// The deployment's styles (from config.json, the first being the default)
// and the user's own choice from the settings, which takes precedence.
const MAP_STYLES_STORAGE_KEY = 'mapexplorer.mapStyles';
// Where the default style was kept before config.json had a list of them.
const LEGACY_STYLE_URL_STORAGE_KEY = 'mapexplorer.styleUrl';
const CUSTOM_STYLE_URL_STORAGE_KEY = 'mapexplorer.customStyleUrl';
const CUSTOM_DARK_STYLE_URL_STORAGE_KEY = 'mapexplorer.customDarkStyleUrl';
const MAP_POSITION_STORAGE_KEY = 'mapexplorer.mapPosition';
const ENABLED_OVERLAYS_STORAGE_KEY = 'mapexplorer.enabledOverlays';
const OVERLAY_OPACITIES_STORAGE_KEY = 'mapexplorer.overlayOpacities';

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

// Connected servers and the overlays and geo objects fetched from them live
// in IndexedDB.
// Everything else here is small config and stays in localStorage for
// simplicity. Bump the version whenever a store is added - older installs
// already have this database at version 3 (from earlier, retired stores).
const IDB_DATABASE_NAME = 'mapexplorer';
const IDB_DATABASE_VERSION = 9;
const OVERLAY_SERVERS_TABLE_NAME = 'overlayServers';
const UNIT_SERVERS_TABLE_NAME = 'unitServers';
const AVAILABLE_OVERLAYS_TABLE_NAME = 'availableOverlays';
const AVAILABLE_OVERLAYS_SERVER_INDEX_NAME = 'serverId';
const GEO_OBJECTS_TABLE_NAME = 'geoObjects';
const GEO_OBJECTS_SERVER_INDEX_NAME = 'serverId';
const OVERLAY_LAYERS_TABLE_NAME = 'overlayLayers';
const OVERLAY_LAYERS_SERVER_INDEX_NAME = 'serverId';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      [OVERLAY_SERVERS_TABLE_NAME, UNIT_SERVERS_TABLE_NAME].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
      // Before v6 this held one row per server with all its overlays. It's
      // only a cache, so the old rows are dropped rather than migrated.
      if (
        event.oldVersion < 6 &&
        db.objectStoreNames.contains(AVAILABLE_OVERLAYS_TABLE_NAME)
      ) {
        db.deleteObjectStore(AVAILABLE_OVERLAYS_TABLE_NAME);
      }
      if (!db.objectStoreNames.contains(AVAILABLE_OVERLAYS_TABLE_NAME)) {
        // The same map uuid can show up on more than one server (mirrored
        // maps), so rows are keyed by server and uuid together.
        const availableOverlaysStore = db.createObjectStore(
          AVAILABLE_OVERLAYS_TABLE_NAME,
          { keyPath: ['serverId', 'uuid'] },
        );
        availableOverlaysStore.createIndex(
          AVAILABLE_OVERLAYS_SERVER_INDEX_NAME,
          'serverId',
        );
      }
      // In v7 this only held the drawn version of enabled overlays, keyed
      // by overlay and uuid. Also just a cache, so dropped rather than
      // migrated.
      if (
        event.oldVersion < 8 &&
        db.objectStoreNames.contains(GEO_OBJECTS_TABLE_NAME)
      ) {
        db.deleteObjectStore(GEO_OBJECTS_TABLE_NAME);
      }
      if (!db.objectStoreNames.contains(GEO_OBJECTS_TABLE_NAME)) {
        const geoObjectsStore = db.createObjectStore(GEO_OBJECTS_TABLE_NAME, {
          keyPath: ['serverId', 'overlayId', 'overlayVersion', 'uuid'],
        });
        geoObjectsStore.createIndex(GEO_OBJECTS_SERVER_INDEX_NAME, 'serverId');
      }
      if (!db.objectStoreNames.contains(OVERLAY_LAYERS_TABLE_NAME)) {
        const overlayLayersStore = db.createObjectStore(
          OVERLAY_LAYERS_TABLE_NAME,
          { keyPath: ['serverId', 'overlayId', 'overlayVersion', 'name'] },
        );
        overlayLayersStore.createIndex(
          OVERLAY_LAYERS_SERVER_INDEX_NAME,
          'serverId',
        );
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Object stores return rows in primary-key order, so list order is kept in
// an explicit `order` column that's added on the way in and stripped on the
// way out. Resolves to null when nothing has been stored yet (or IndexedDB
// is unavailable), so callers can fall back to their defaults.
async function tableGetAllOrdered<T extends object>(
  storeName: string,
): Promise<T[] | null> {
  try {
    const db = await openDb();
    const stored = await new Promise<(T & { order: number })[]>(
      (resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    if (stored.length === 0) {
      return null;
    }
    return stored
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...record }) => record as unknown as T);
  } catch {
    return null;
  }
}

// Replaces the full contents of a table in one transaction.
async function tableReplaceAllOrdered<T extends object>(
  storeName: string,
  records: T[],
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      records.forEach((record, index) =>
        store.put({ ...record, order: index }),
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // IndexedDB unavailable (e.g. private browsing) - skip persistence
  }
}

export function loadOverlayServers(): Promise<ConnectedServer[] | null> {
  return tableGetAllOrdered<ConnectedServer>(OVERLAY_SERVERS_TABLE_NAME);
}

export function saveOverlayServers(servers: ConnectedServer[]): Promise<void> {
  return tableReplaceAllOrdered(OVERLAY_SERVERS_TABLE_NAME, servers);
}

export function loadUnitServers(): Promise<ConnectedServer[] | null> {
  return tableGetAllOrdered<ConnectedServer>(UNIT_SERVERS_TABLE_NAME);
}

export function saveUnitServers(servers: ConnectedServer[]): Promise<void> {
  return tableReplaceAllOrdered(UNIT_SERVERS_TABLE_NAME, servers);
}

// The overlays last fetched from each overlay server, one row per overlay,
// so they're available straight away on startup and while offline. Each row
// also carries the user's settings for that overlay.
type AvailableOverlayRecord = OverlayMap & {
  serverId: string;
  enabled: boolean;
  // Position among the enabled overlays (later ones are drawn on top). Only
  // set while enabled.
  enabledOrder?: number;
  // Unset until the user changes it from the default.
  opacity?: number;
  // The version to draw. Unset to follow the overlay's currentVersion.
  selectedVersion?: string;
  // Names of the GeoJSON layers the user switched off. Unset if none.
  hiddenLayers?: string[];
};

export interface AvailableOverlaysState {
  overlays: Record<string, OverlayMap[]>;
  // In the order they were switched on.
  enabledOverlayIds: string[];
  overlayOpacities: Record<string, number>;
  // Only overlays pinned to a version other than their current one.
  overlayVersions: Record<string, string>;
  // Names of the GeoJSON layers switched off, by overlay. Only overlays
  // with any.
  overlayHiddenLayers: Record<string, string[]>;
}

export async function loadAvailableOverlays(): Promise<AvailableOverlaysState> {
  const stored =
    (await tableGetAllOrdered<AvailableOverlayRecord>(
      AVAILABLE_OVERLAYS_TABLE_NAME,
    )) ?? [];
  const overlays: Record<string, OverlayMap[]> = {};
  const enabled: { id: string; order: number }[] = [];
  const overlayOpacities: Record<string, number> = {};
  const overlayVersions: Record<string, string> = {};
  const overlayHiddenLayers: Record<string, string[]> = {};
  for (const {
    serverId,
    enabled: isEnabled,
    enabledOrder,
    opacity,
    selectedVersion,
    hiddenLayers,
    ...overlay
  } of stored) {
    // Rows stored before versions were fetched have none.
    (overlays[serverId] ??= []).push({
      ...overlay,
      versions: overlay.versions ?? [],
    });
    if (isEnabled) {
      enabled.push({ id: overlay.uuid, order: enabledOrder ?? 0 });
    }
    if (opacity !== undefined) {
      overlayOpacities[overlay.uuid] = opacity;
    }
    if (selectedVersion !== undefined) {
      overlayVersions[overlay.uuid] = selectedVersion;
    }
    if (hiddenLayers?.length) {
      overlayHiddenLayers[overlay.uuid] = hiddenLayers;
    }
  }
  return {
    overlays,
    enabledOverlayIds: [
      ...new Set(enabled.sort((a, b) => a.order - b.order).map(({ id }) => id)),
    ],
    overlayOpacities,
    overlayVersions,
    overlayHiddenLayers,
  };
}

export async function saveAvailableOverlays({
  overlays,
  enabledOverlayIds,
  overlayOpacities,
  overlayVersions,
  overlayHiddenLayers,
}: AvailableOverlaysState): Promise<void> {
  const records: AvailableOverlayRecord[] = Object.entries(overlays).flatMap(
    ([serverId, list]) =>
      list.map((overlay) => {
        const enabledOrder = enabledOverlayIds.indexOf(overlay.uuid);
        return {
          ...overlay,
          serverId,
          enabled: enabledOrder !== -1,
          enabledOrder: enabledOrder !== -1 ? enabledOrder : undefined,
          opacity: overlayOpacities[overlay.uuid],
          selectedVersion: overlayVersions[overlay.uuid],
          hiddenLayers: overlayHiddenLayers[overlay.uuid],
        };
      }),
  );
  await tableReplaceAllOrdered(AVAILABLE_OVERLAYS_TABLE_NAME, records);
  // Once the settings live in rows, drop the old localStorage copies. Not
  // before, or they'd be lost if the first fetch after upgrading fails.
  if (records.length > 0) {
    writeValue(ENABLED_OVERLAYS_STORAGE_KEY, '');
    writeValue(OVERLAY_OPACITIES_STORAGE_KEY, '');
  }
}

// The geo objects last fetched for every version of every overlay, one row
// per geo object, so they're available straight away on startup and while
// offline. `overlayVersion` is the version they were fetched for.
type GeoObjectRecord = OverlayGeoObject & {
  serverId: string;
  overlayId: string;
  overlayVersion: string;
};

// Geo objects by server id, overlay id and version.
export type StoredGeoObjects = Record<
  string,
  Record<string, Record<string, OverlayGeoObject[]>>
>;

export async function loadGeoObjects(): Promise<StoredGeoObjects> {
  const stored =
    (await tableGetAllOrdered<GeoObjectRecord>(GEO_OBJECTS_TABLE_NAME)) ?? [];
  const geoObjects: StoredGeoObjects = {};
  for (const { serverId, overlayId, overlayVersion, ...geoObject } of stored) {
    ((geoObjects[serverId] ??= {})[overlayId] ??= {})[overlayVersion] ??= [];
    geoObjects[serverId][overlayId][overlayVersion].push(geoObject);
  }
  return geoObjects;
}

export function saveGeoObjects(geoObjects: StoredGeoObjects): Promise<void> {
  const records: GeoObjectRecord[] = Object.entries(geoObjects).flatMap(
    ([serverId, byOverlay]) =>
      Object.entries(byOverlay).flatMap(([overlayId, byVersion]) =>
        Object.entries(byVersion).flatMap(([overlayVersion, list]) =>
          list.map((geoObject) => ({
            ...geoObject,
            serverId,
            overlayId,
            overlayVersion,
          })),
        ),
      ),
  );
  return tableReplaceAllOrdered(GEO_OBJECTS_TABLE_NAME, records);
}

// A map version's GeoJSON layer together with its document.
export type OverlayLayerData = OverlayLayer & { data: GeoJSON };

// The GeoJSON layers last fetched for the drawn version of each enabled
// overlay, one row per layer, so they're available straight away on startup
// and while offline. `overlayVersion` is the version they were fetched for.
type OverlayLayerRecord = OverlayLayerData & {
  serverId: string;
  overlayId: string;
  overlayVersion: string;
};

// Layers by server id, overlay id and version, each version's in the
// server's order.
export type StoredOverlayLayers = Record<
  string,
  Record<string, Record<string, OverlayLayerData[]>>
>;

export async function loadOverlayLayers(): Promise<StoredOverlayLayers> {
  const stored =
    (await tableGetAllOrdered<OverlayLayerRecord>(OVERLAY_LAYERS_TABLE_NAME)) ??
    [];
  const layers: StoredOverlayLayers = {};
  for (const { serverId, overlayId, overlayVersion, ...layer } of stored) {
    ((layers[serverId] ??= {})[overlayId] ??= {})[overlayVersion] ??= [];
    layers[serverId][overlayId][overlayVersion].push(layer);
  }
  return layers;
}

export function saveOverlayLayers(layers: StoredOverlayLayers): Promise<void> {
  const records: OverlayLayerRecord[] = Object.entries(layers).flatMap(
    ([serverId, byOverlay]) =>
      Object.entries(byOverlay).flatMap(([overlayId, byVersion]) =>
        Object.entries(byVersion).flatMap(([overlayVersion, list]) =>
          list.map((layer) => ({
            ...layer,
            serverId,
            overlayId,
            overlayVersion,
          })),
        ),
      ),
  );
  return tableReplaceAllOrdered(OVERLAY_LAYERS_TABLE_NAME, records);
}

// The configured servers are applied by ConnectedServersProvider.
export function applyConfig(config: AppConfig): void {
  const styles = (Array.isArray(config.mapStyles) ? config.mapStyles : [])
    .filter((style) => style && typeof style.url === 'string' && style.url)
    .map(({ name, url }) => ({ name: name || hostOf(url), url }));
  const previousDefault = loadDefaultStyleUrl();
  writeValue(
    MAP_STYLES_STORAGE_KEY,
    styles.length ? JSON.stringify(styles) : '',
  );
  writeValue(LEGACY_STYLE_URL_STORAGE_KEY, '');
  // Only visible when the user hasn't picked their own style.
  if (loadDefaultStyleUrl() !== previousDefault && !loadCustomStyleUrl()) {
    window.location.reload();
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// The styles from the last loaded config.json, each with a name.
export function loadMapStyles(): Required<MapStyle>[] {
  try {
    const parsed = JSON.parse(readValue(MAP_STYLES_STORAGE_KEY, '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadDefaultStyleUrl(): string {
  return loadMapStyles()[0]?.url ?? readValue(LEGACY_STYLE_URL_STORAGE_KEY);
}

export type ColorScheme = 'light' | 'dark';

// The basemap for each color scheme. Without a style of its own, dark mode
// uses the light mode one.
export function loadStyleUrl(
  defaultStyleUrl: string,
  scheme: ColorScheme = 'light',
): string {
  if (scheme === 'dark') {
    return loadCustomStyleUrl('dark') || loadStyleUrl(defaultStyleUrl, 'light');
  }
  return loadCustomStyleUrl() || loadDefaultStyleUrl() || defaultStyleUrl;
}

export function loadCustomStyleUrl(scheme: ColorScheme = 'light'): string {
  return readValue(customStyleUrlKey(scheme));
}

// An empty url goes back to the default style, in dark mode to the light
// mode one.
export function saveCustomStyleUrl(
  url: string,
  scheme: ColorScheme = 'light',
): void {
  writeValue(customStyleUrlKey(scheme), url);
}

function customStyleUrlKey(scheme: ColorScheme): string {
  return scheme === 'dark'
    ? CUSTOM_DARK_STYLE_URL_STORAGE_KEY
    : CUSTOM_STYLE_URL_STORAGE_KEY;
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

const UNIT_SYMBOL_SIZE_STORAGE_KEY = 'mapexplorer.unitSymbolSize';
export const DEFAULT_UNIT_SYMBOL_SIZE = 50;
export const MIN_UNIT_SYMBOL_SIZE = 20;
export const MAX_UNIT_SYMBOL_SIZE = 120;

// Height of unit symbols on the map, in pixels.
export function loadUnitSymbolSize(): number {
  const stored = Number(readValue(UNIT_SYMBOL_SIZE_STORAGE_KEY));
  if (!stored || !Number.isFinite(stored)) {
    return DEFAULT_UNIT_SYMBOL_SIZE;
  }
  return Math.min(MAX_UNIT_SYMBOL_SIZE, Math.max(MIN_UNIT_SYMBOL_SIZE, stored));
}

// The default size isn't stored, so a changed default applies.
export function saveUnitSymbolSize(size: number): void {
  writeValue(
    UNIT_SYMBOL_SIZE_STORAGE_KEY,
    size === DEFAULT_UNIT_SYMBOL_SIZE ? '' : String(size),
  );
}

// Deletes the whole IndexedDB database. Open connections block the deletion
// until they close (e.g. on reload), so a blocked request counts as done.
export function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(IDB_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Sessions from signing in to a connected server itself, rather than through
// SSO, keyed by server id. Kept in localStorage like the SSO session.
export const SERVER_SESSIONS_STORAGE_KEY = 'mapexplorer.serverSessions';

export interface ServerSession {
  kind: 'overlay' | 'unit';
  username: string;
  token: string;
  // Milliseconds since the epoch, or null if unknown.
  expiresAt: number | null;
  // Overlay servers only; single-use, each refresh returns a new one.
  refreshToken?: string;
}

export function loadServerSessions(): Record<string, ServerSession> {
  const stored = readValue(SERVER_SESSIONS_STORAGE_KEY);
  if (!stored) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, ServerSession>)
      : {};
  } catch {
    return {};
  }
}

export function saveServerSessions(
  sessions: Record<string, ServerSession>,
): void {
  writeValue(
    SERVER_SESSIONS_STORAGE_KEY,
    Object.keys(sessions).length > 0 ? JSON.stringify(sessions) : '',
  );
}
