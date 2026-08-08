import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { GeoObjectEntry, Overlay } from '../types';
import type { GeoObject, GeoObjectRequest } from '../api/serverApi';
import {
  ServerApiError,
  createGeoObject as apiCreateGeoObject,
  deleteGeoObject as apiDeleteGeoObject,
  listGeoObjects,
  updateGeoObject as apiUpdateGeoObject,
} from '../api/serverApi';
import type { ServerConnection } from '../lib/storage';
import {
  loadActiveOverlayId,
  loadCachedGeoObjects,
  saveActiveOverlayId,
  saveGeoObjectsForOverlay,
} from '../lib/storage';
import { useOverlays } from './OverlaysContext';
import { useServers } from './ServersContext';

export function describeGeoObjectError(err: unknown): string {
  if (err instanceof ServerApiError) {
    if (err.status === 401) {
      return 'Session expired. Please sign in again.';
    }
    if (err.status === 403) {
      return 'You do not have permission to do that on this map.';
    }
    if (err.status === 404) {
      return 'This object no longer exists on the server.';
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Network error talking to the server.';
}

// PUT replaces the whole GeoObject, so a partial edit (rename, drag) must
// carry forward the fields it isn't touching or the server would wipe them.
export function toGeoObjectRequest(
  entry: GeoObjectEntry,
  overrides: Partial<GeoObjectRequest> = {},
): GeoObjectRequest {
  return {
    name: entry.geoObject.name,
    latitude: entry.geoObject.latitude,
    longitude: entry.geoObject.longitude,
    externalId: entry.geoObject.externalId,
    street: entry.geoObject.street,
    housenumber: entry.geoObject.housenumber,
    postcode: entry.geoObject.postcode,
    ...overrides,
  };
}

function isEligibleOverlay(overlay: Overlay): boolean {
  return Boolean(
    overlay.enabled && overlay.serverId && overlay.mapId && overlay.mapVersion,
  );
}

interface GeoObjectsContextValue {
  geoObjectsByOverlay: Record<string, GeoObjectEntry[]>;
  allGeoObjects: GeoObjectEntry[];
  loadingOverlayIds: string[];
  errorsByOverlay: Record<string, string>;
  eligibleOverlays: Overlay[];
  activeOverlayId: string | null;
  setActiveOverlayId: (id: string | null) => void;
  isOnline: boolean;
  createGeoObject: (
    overlayId: string,
    req: GeoObjectRequest,
  ) => Promise<GeoObjectEntry>;
  updateGeoObject: (
    overlayId: string,
    uuid: string,
    req: GeoObjectRequest,
  ) => Promise<GeoObjectEntry>;
  deleteGeoObject: (overlayId: string, uuid: string) => Promise<void>;
}

const GeoObjectsContext = createContext<GeoObjectsContextValue | null>(null);

export function GeoObjectsProvider({ children }: { children: ReactNode }) {
  const { overlays } = useOverlays();
  const { servers, callWithAuth } = useServers();

  const [geoObjectsByOverlay, setGeoObjectsByOverlay] = useState<
    Record<string, GeoObjectEntry[]>
  >({});
  const [loadingOverlayIds, setLoadingOverlayIds] = useState<string[]>([]);
  const [errorsByOverlay, setErrorsByOverlay] = useState<
    Record<string, string>
  >({});
  const [activeOverlayId, setActiveOverlayIdState] = useState<string | null>(
    () => loadActiveOverlayId(),
  );
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const serversRef = useRef<ServerConnection[]>(servers);
  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // create/update/delete need to know the just-written entries synchronously
  // (to persist them to the cache right after) which a `geoObjectsByOverlay`
  // -driven effect can't guarantee - so, same fix as ServersContext's
  // `applyServers`, every mutation goes through this ref-backed helper
  // instead of `setGeoObjectsByOverlay` directly.
  const geoObjectsByOverlayRef = useRef<Record<string, GeoObjectEntry[]>>({});
  const applyGeoObjectsByOverlay = useCallback(
    (
      updater: (
        prev: Record<string, GeoObjectEntry[]>,
      ) => Record<string, GeoObjectEntry[]>,
    ): Record<string, GeoObjectEntry[]> => {
      const next = updater(geoObjectsByOverlayRef.current);
      geoObjectsByOverlayRef.current = next;
      setGeoObjectsByOverlay(next);
      return next;
    },
    [],
  );

  // Hydrate from the offline cache once on mount, independent of network -
  // this is what makes previously-seen GeoObjects visible immediately when
  // opening the app offline.
  useEffect(() => {
    let cancelled = false;
    loadCachedGeoObjects().then((cached) => {
      if (cancelled || cached.length === 0) {
        return;
      }
      applyGeoObjectsByOverlay((prev) => {
        const next = { ...prev };
        cached.forEach((entry) => {
          next[entry.overlayId] = [...(next[entry.overlayId] ?? []), entry];
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guards against overlapping fetches for the same overlay (e.g. a double
  // Resync click, or a version-change and a reconnect firing close
  // together) applying out of arrival order: each fetch stamps a generation
  // number, and only the response matching the *latest* generation for that
  // overlay is allowed to update state - a stale one is silently dropped.
  const fetchGenerationRef = useRef<Record<string, number>>({});

  const fetchForOverlay = useCallback(
    async (overlay: Overlay) => {
      if (!overlay.serverId || !overlay.mapId || !overlay.mapVersion) {
        return;
      }
      const server = serversRef.current.find((s) => s.id === overlay.serverId);
      if (!server) {
        return;
      }
      const mapId = overlay.mapId;
      const mapVersion = overlay.mapVersion;
      const generation = (fetchGenerationRef.current[overlay.id] ?? 0) + 1;
      fetchGenerationRef.current[overlay.id] = generation;
      const isCurrent = () =>
        fetchGenerationRef.current[overlay.id] === generation;
      setLoadingOverlayIds((prev) =>
        prev.includes(overlay.id) ? prev : [...prev, overlay.id],
      );
      try {
        const list: GeoObject[] = await callWithAuth(server.id, (t) =>
          listGeoObjects(server.baseUrl, mapId, mapVersion, t),
        );
        if (!isCurrent()) {
          return;
        }
        const entries: GeoObjectEntry[] = list.map((geoObject) => ({
          geoObject,
          overlayId: overlay.id,
          serverId: server.id,
          mapId,
          mapVersion,
          mapName: overlay.name,
          serverBaseUrl: server.baseUrl,
        }));
        applyGeoObjectsByOverlay((prev) => ({
          ...prev,
          [overlay.id]: entries,
        }));
        setErrorsByOverlay((prev) => {
          if (!(overlay.id in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[overlay.id];
          return next;
        });
        await saveGeoObjectsForOverlay(overlay.id, entries);
      } catch (err) {
        if (!isCurrent()) {
          return;
        }
        // Offline or network failure: keep whatever's already shown (from
        // cache or a prior fetch) rather than clearing it, just surface the
        // error.
        setErrorsByOverlay((prev) => ({
          ...prev,
          [overlay.id]: describeGeoObjectError(err),
        }));
      } finally {
        if (isCurrent()) {
          setLoadingOverlayIds((prev) =>
            prev.filter((id) => id !== overlay.id),
          );
        }
      }
    },
    [callWithAuth, applyGeoObjectsByOverlay],
  );

  const clearOverlayEntries = useCallback(
    (overlayId: string) => {
      applyGeoObjectsByOverlay((prev) => {
        if (!(overlayId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[overlayId];
        return next;
      });
      setErrorsByOverlay((prev) => {
        if (!(overlayId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[overlayId];
        return next;
      });
    },
    [applyGeoObjectsByOverlay],
  );

  // Fetch GeoObjects whenever a server-linked overlay becomes enabled or its
  // tracked version changes (a resync); drop the in-memory (not cached) view
  // when it's disabled or removed.
  const prevOverlaysRef = useRef<Overlay[]>([]);
  useEffect(() => {
    const prev = prevOverlaysRef.current;
    overlays.forEach((overlay) => {
      if (!overlay.serverId || !overlay.mapId || !overlay.mapVersion) {
        return;
      }
      const prior = prev.find((o) => o.id === overlay.id);
      const becameEnabled = overlay.enabled && (!prior || !prior.enabled);
      const versionChanged =
        overlay.enabled &&
        prior?.enabled &&
        prior.mapVersion !== overlay.mapVersion;
      if (becameEnabled || versionChanged) {
        fetchForOverlay(overlay);
      }
      if (!overlay.enabled && prior?.enabled) {
        clearOverlayEntries(overlay.id);
      }
    });
    prev.forEach((prior) => {
      if (!overlays.some((o) => o.id === prior.id)) {
        clearOverlayEntries(prior.id);
      }
    });
    prevOverlaysRef.current = overlays;
  }, [overlays, fetchForOverlay, clearOverlayEntries]);

  // Regained connectivity - refresh whatever's currently eligible/enabled.
  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      overlays.filter(isEligibleOverlay).forEach((overlay) => {
        fetchForOverlay(overlay);
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, overlays, fetchForOverlay]);

  const eligibleOverlays = useMemo(
    () => overlays.filter(isEligibleOverlay),
    [overlays],
  );

  const setActiveOverlayId = useCallback((id: string | null) => {
    setActiveOverlayIdState(id);
    saveActiveOverlayId(id);
  }, []);

  useEffect(() => {
    const stillEligible = eligibleOverlays.some(
      (o) => o.id === activeOverlayId,
    );
    if (activeOverlayId && !stillEligible) {
      setActiveOverlayId(
        eligibleOverlays.length === 1 ? eligibleOverlays[0].id : null,
      );
    } else if (!activeOverlayId && eligibleOverlays.length === 1) {
      setActiveOverlayId(eligibleOverlays[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleOverlays]);

  const allGeoObjects = useMemo(
    () => Object.values(geoObjectsByOverlay).flat(),
    [geoObjectsByOverlay],
  );

  const resolveOverlay = useCallback(
    (
      overlayId: string,
    ): {
      overlay: Overlay;
      mapId: string;
      mapVersion: string;
      server: ServerConnection;
    } => {
      const overlay = overlays.find((o) => o.id === overlayId);
      if (
        !overlay ||
        !overlay.serverId ||
        !overlay.mapId ||
        !overlay.mapVersion
      ) {
        throw new Error('This map is no longer connected.');
      }
      const server = serversRef.current.find((s) => s.id === overlay.serverId);
      if (!server) {
        throw new Error('This map is no longer connected.');
      }
      return {
        overlay,
        mapId: overlay.mapId,
        mapVersion: overlay.mapVersion,
        server,
      };
    },
    [overlays],
  );

  const createGeoObject = useCallback(
    async (
      overlayId: string,
      req: GeoObjectRequest,
    ): Promise<GeoObjectEntry> => {
      if (!isOnline) {
        throw new Error('Cannot create a marker while offline.');
      }
      const { overlay, mapId, mapVersion, server } = resolveOverlay(overlayId);
      const geoObject = await callWithAuth(server.id, (t) =>
        apiCreateGeoObject(server.baseUrl, mapId, mapVersion, t, req),
      );
      const entry: GeoObjectEntry = {
        geoObject,
        overlayId: overlay.id,
        serverId: server.id,
        mapId,
        mapVersion,
        mapName: overlay.name,
        serverBaseUrl: server.baseUrl,
      };
      const next = applyGeoObjectsByOverlay((prev) => ({
        ...prev,
        [overlayId]: [...(prev[overlayId] ?? []), entry],
      }));
      await saveGeoObjectsForOverlay(overlayId, next[overlayId]);
      return entry;
    },
    [isOnline, resolveOverlay, callWithAuth, applyGeoObjectsByOverlay],
  );

  const updateGeoObject = useCallback(
    async (
      overlayId: string,
      uuid: string,
      req: GeoObjectRequest,
    ): Promise<GeoObjectEntry> => {
      const { overlay, mapId, mapVersion, server } = resolveOverlay(overlayId);
      const geoObject = await callWithAuth(server.id, (t) =>
        apiUpdateGeoObject(server.baseUrl, mapId, mapVersion, uuid, t, req),
      );
      const entry: GeoObjectEntry = {
        geoObject,
        overlayId: overlay.id,
        serverId: server.id,
        mapId,
        mapVersion,
        mapName: overlay.name,
        serverBaseUrl: server.baseUrl,
      };
      const next = applyGeoObjectsByOverlay((prev) => ({
        ...prev,
        [overlayId]: (prev[overlayId] ?? []).map((e) =>
          e.geoObject.uuid === uuid ? entry : e,
        ),
      }));
      await saveGeoObjectsForOverlay(overlayId, next[overlayId]);
      return entry;
    },
    [resolveOverlay, callWithAuth, applyGeoObjectsByOverlay],
  );

  const deleteGeoObject = useCallback(
    async (overlayId: string, uuid: string): Promise<void> => {
      const { mapId, mapVersion, server } = resolveOverlay(overlayId);
      await callWithAuth(server.id, (t) =>
        apiDeleteGeoObject(server.baseUrl, mapId, mapVersion, uuid, t),
      );
      const next = applyGeoObjectsByOverlay((prev) => ({
        ...prev,
        [overlayId]: (prev[overlayId] ?? []).filter(
          (e) => e.geoObject.uuid !== uuid,
        ),
      }));
      await saveGeoObjectsForOverlay(overlayId, next[overlayId]);
    },
    [resolveOverlay, callWithAuth, applyGeoObjectsByOverlay],
  );

  const value = useMemo(
    () => ({
      geoObjectsByOverlay,
      allGeoObjects,
      loadingOverlayIds,
      errorsByOverlay,
      eligibleOverlays,
      activeOverlayId,
      setActiveOverlayId,
      isOnline,
      createGeoObject,
      updateGeoObject,
      deleteGeoObject,
    }),
    [
      geoObjectsByOverlay,
      allGeoObjects,
      loadingOverlayIds,
      errorsByOverlay,
      eligibleOverlays,
      activeOverlayId,
      setActiveOverlayId,
      isOnline,
      createGeoObject,
      updateGeoObject,
      deleteGeoObject,
    ],
  );

  return (
    <GeoObjectsContext.Provider value={value}>
      {children}
    </GeoObjectsContext.Provider>
  );
}

export function useGeoObjects(): GeoObjectsContextValue {
  const context = useContext(GeoObjectsContext);
  if (!context) {
    throw new Error('useGeoObjects must be used within a GeoObjectsProvider');
  }
  return context;
}
