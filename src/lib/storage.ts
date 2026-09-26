import type { OverlayGeoObject, OverlayMap } from '../api/OverlayServer';
import type { ConnectedServer, MapPosition } from '../types';

const STYLE_URL_STORAGE_KEY = 'mapexplorer.styleUrl';
const DEFAULT_SERVER_URL_STORAGE_KEY = 'mapexplorer.serverBaseUrl';
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
const IDB_DATABASE_VERSION = 8;
const OVERLAY_SERVERS_TABLE_NAME = 'overlayServers';
const UNIT_SERVERS_TABLE_NAME = 'unitServers';
const AVAILABLE_OVERLAYS_TABLE_NAME = 'availableOverlays';
const AVAILABLE_OVERLAYS_SERVER_INDEX_NAME = 'serverId';
const GEO_OBJECTS_TABLE_NAME = 'geoObjects';
const GEO_OBJECTS_SERVER_INDEX_NAME = 'serverId';

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
};

export interface AvailableOverlaysState {
  overlays: Record<string, OverlayMap[]>;
  // In the order they were switched on.
  enabledOverlayIds: string[];
  overlayOpacities: Record<string, number>;
  // Only overlays pinned to a version other than their current one.
  overlayVersions: Record<string, string>;
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
  for (const {
    serverId,
    enabled: isEnabled,
    enabledOrder,
    opacity,
    selectedVersion,
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
  }
  return {
    overlays,
    enabledOverlayIds: [
      ...new Set(enabled.sort((a, b) => a.order - b.order).map(({ id }) => id)),
    ],
    overlayOpacities,
    overlayVersions,
  };
}

export async function saveAvailableOverlays({
  overlays,
  enabledOverlayIds,
  overlayOpacities,
  overlayVersions,
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

function saveStyleUrl(url: string): void {
  writeValue(STYLE_URL_STORAGE_KEY, url);
}

// Base URL suggested by config.json for a fresh install, used to prefill
// the first server a user adds. Not tied to any particular connection.
function loadDefaultServerUrl(defaultBaseUrl = ''): string {
  return readValue(DEFAULT_SERVER_URL_STORAGE_KEY, defaultBaseUrl);
}

function saveDefaultServerUrl(url: string): void {
  writeValue(DEFAULT_SERVER_URL_STORAGE_KEY, url);
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
