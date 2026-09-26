import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useConnectedServers } from './ConnectedServersContext.tsx';
import {
  type OverlayGeoObject,
  type OverlayMap,
  OverlayServer,
} from '../api/OverlayServer.ts';
import type { ConnectedServer } from '../types.ts';
import { useAuth } from './AuthContext.tsx';
import {
  loadAvailableOverlays,
  loadGeoObjects,
  saveAvailableOverlays,
  saveGeoObjects,
} from '../lib/storage.ts';

export const DEFAULT_OVERLAY_OPACITY = 0.8;

// An enabled overlay resolved to what the map needs to draw it.
export interface EnabledOverlay {
  id: string;
  serverId: string;
  // The version drawn.
  version: string;
  tiles: string[];
  opacity: number;
}

interface OverlaysContextValue {
  overlays: Record<string, OverlayMap[]>;
  enabledOverlayIds: string[];
  setOverlayEnabled: (overlayId: string, enabled: boolean) => void;
  getOverlayOpacity: (overlayId: string) => number;
  setOverlayOpacity: (overlayId: string, opacity: number) => void;
  // The version drawn for an overlay: the one the user picked, or its
  // currentVersion.
  getOverlayVersion: (overlay: OverlayMap) => string;
  setOverlayVersion: (overlay: OverlayMap, version: string) => void;
  // Enabled overlays in the order they were switched on, so the most
  // recently enabled one is drawn on top.
  enabledOverlays: EnabledOverlay[];
  // Geo objects of every version of every known overlay.
  geoObjects: GeoObjectsByServer;
}

// Geo objects by server id, overlay id and version, in that order.
export type GeoObjectsByServer = Record<
  string,
  Record<string, Record<string, OverlayGeoObject[]>>
>;

const OverlaysContext = createContext<OverlaysContextValue | null>(null);

export function OverlaysProvider({ children }: { children: ReactNode }) {
  const { overlayServers } = useConnectedServers();
  const { accessToken } = useAuth();

  const [overlays, setOverlays] = useState<Record<string, OverlayMap[]>>({});
  const [enabledOverlayIds, setEnabledOverlayIds] = useState<string[]>([]);
  const [overlayOpacities, setOverlayOpacities] = useState<
    Record<string, number>
  >({});
  const [overlayVersions, setOverlayVersions] = useState<
    Record<string, string>
  >({});
  const [geoObjects, setGeoObjects] = useState<GeoObjectsByServer>({});
  // Holds off saving until the cached overlays and geo objects have been
  // read, so the empty initial state never overwrites what's already in
  // IndexedDB.
  const [cacheLoaded, setCacheLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadAvailableOverlays(), loadGeoObjects()]).then(
      ([cached, cachedGeoObjects]) => {
        if (cancelled) {
          return;
        }
        // Anything fetched in the meantime is fresher than the cache.
        setOverlays((prev) => ({ ...cached.overlays, ...prev }));
        setGeoObjects((prev) => ({ ...cachedGeoObjects, ...prev }));
        setEnabledOverlayIds(cached.enabledOverlayIds);
        setOverlayOpacities(cached.overlayOpacities);
        setOverlayVersions(cached.overlayVersions);
        setCacheLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchOverlays = async () => {
      const fetched: Record<string, OverlayMap[]> = {};
      // Only versions whose fetch succeeded.
      const fetchedGeoObjects: GeoObjectsByServer = {};
      await Promise.all(
        overlayServers.map(async (server) => {
          const ovS = new OverlayServer(server.baseUrl, () => accessToken);
          let maps: OverlayMap[];
          try {
            maps = await ovS.listOverlays({}, controller.signal);
          } catch (error) {
            if (!controller.signal.aborted) {
              console.error(
                `Error occurred while fetching overlays from server ${server.name}:`,
                error,
              );
            }
            return;
          }
          fetched[server.id] = maps;
          const serverGeoObjects: GeoObjectsByServer[string] = {};
          fetchedGeoObjects[server.id] = serverGeoObjects;
          await Promise.all(
            maps.flatMap((map) =>
              map.versions.map(async ({ version }) => {
                try {
                  const list = await ovS.listGeoObjects(
                    map.uuid,
                    version,
                    {},
                    controller.signal,
                  );
                  (serverGeoObjects[map.uuid] ??= {})[version] = list;
                } catch (error) {
                  if (!controller.signal.aborted) {
                    console.error(
                      `Error occurred while fetching geo objects of overlay ${map.name} version ${version} from server ${server.name}:`,
                      error,
                    );
                  }
                }
              }),
            ),
          );
        }),
      );
      if (controller.signal.aborted) {
        return;
      }
      // Servers that couldn't be reached keep their last known overlays and
      // geo objects; servers no longer configured are dropped.
      setOverlays((prev) => {
        const next: Record<string, OverlayMap[]> = {};
        for (const server of overlayServers) {
          const list = fetched[server.id] ?? prev[server.id];
          if (list) {
            next[server.id] = list;
          }
        }
        return next;
      });
      setGeoObjects((prev) => {
        const next: GeoObjectsByServer = {};
        for (const server of overlayServers) {
          const maps = fetched[server.id];
          if (!maps) {
            if (prev[server.id]) {
              next[server.id] = prev[server.id];
            }
            continue;
          }
          // Versions whose fetch failed keep their last known geo objects;
          // overlays and versions that are gone are dropped.
          const serverGeoObjects: GeoObjectsByServer[string] = {};
          for (const map of maps) {
            for (const { version } of map.versions) {
              const list =
                fetchedGeoObjects[server.id]?.[map.uuid]?.[version] ??
                prev[server.id]?.[map.uuid]?.[version];
              if (list) {
                (serverGeoObjects[map.uuid] ??= {})[version] = list;
              }
            }
          }
          next[server.id] = serverGeoObjects;
        }
        return next;
      });
    };

    void fetchOverlays();

    return () => {
      controller.abort();
    };
  }, [overlayServers, accessToken]);

  useEffect(() => {
    console.log('Overlays updated:', overlays);
  }, [overlays]);

  useEffect(() => {
    if (cacheLoaded) {
      void saveAvailableOverlays({
        overlays,
        enabledOverlayIds,
        overlayOpacities,
        overlayVersions,
      });
    }
  }, [
    cacheLoaded,
    overlays,
    enabledOverlayIds,
    overlayOpacities,
    overlayVersions,
  ]);

  useEffect(() => {
    if (cacheLoaded) {
      void saveGeoObjects(geoObjects);
    }
  }, [cacheLoaded, geoObjects]);

  const setOverlayEnabled = useCallback(
    (overlayId: string, enabled: boolean) => {
      setEnabledOverlayIds((prev) => {
        const without = prev.filter((id) => id !== overlayId);
        return enabled ? [...without, overlayId] : without;
      });
    },
    [],
  );

  const getOverlayOpacity = useCallback(
    (overlayId: string) =>
      overlayOpacities[overlayId] ?? DEFAULT_OVERLAY_OPACITY,
    [overlayOpacities],
  );

  const setOverlayOpacity = useCallback(
    (overlayId: string, opacity: number) => {
      setOverlayOpacities((prev) => ({ ...prev, [overlayId]: opacity }));
    },
    [],
  );

  const getOverlayVersion = useCallback(
    (overlay: OverlayMap) => {
      const selected = overlayVersions[overlay.uuid];
      // Fall back if the picked version has since been deleted.
      return selected !== undefined &&
        overlay.versions.some(({ version }) => version === selected)
        ? selected
        : overlay.currentVersion;
    },
    [overlayVersions],
  );

  const setOverlayVersion = useCallback(
    (overlay: OverlayMap, version: string) => {
      setOverlayVersions((prev) => {
        const next = { ...prev };
        // Picking the current version drops the override, so the overlay
        // follows it again when the server's current version changes.
        if (version === overlay.currentVersion) {
          delete next[overlay.uuid];
        } else {
          next[overlay.uuid] = version;
        }
        return next;
      });
    },
    [],
  );

  // Each enabled overlay's map, server and drawn version. Kept apart from
  // `enabledOverlays` so opacity changes don't refetch geo objects.
  const enabledSources = useMemo(() => {
    const result: {
      overlay: OverlayMap;
      server: ConnectedServer;
      version: string;
    }[] = [];
    for (const overlayId of enabledOverlayIds) {
      for (const server of overlayServers) {
        const overlay = overlays[server.id]?.find((o) => o.uuid === overlayId);
        if (overlay) {
          result.push({ overlay, server, version: getOverlayVersion(overlay) });
          break;
        }
      }
    }
    return result;
  }, [enabledOverlayIds, overlays, overlayServers, getOverlayVersion]);

  const enabledOverlays = useMemo(
    () =>
      enabledSources.map(({ overlay, server, version }): EnabledOverlay => {
        const baseUrl = server.baseUrl.replace(/\/+$/, '');
        return {
          id: overlay.uuid,
          serverId: server.id,
          version,
          tiles: [
            `${baseUrl}/maps/${overlay.uuid}/version/${version}/{z}/{x}/{y}.png`,
          ],
          opacity: getOverlayOpacity(overlay.uuid),
        };
      }),
    [enabledSources, getOverlayOpacity],
  );

  const value = useMemo(
    () => ({
      overlays,
      enabledOverlayIds,
      setOverlayEnabled,
      getOverlayOpacity,
      setOverlayOpacity,
      getOverlayVersion,
      setOverlayVersion,
      enabledOverlays,
      geoObjects,
    }),
    [
      overlays,
      enabledOverlayIds,
      setOverlayEnabled,
      getOverlayOpacity,
      setOverlayOpacity,
      getOverlayVersion,
      setOverlayVersion,
      enabledOverlays,
      geoObjects,
    ],
  );

  return (
    <OverlaysContext.Provider value={value}>
      {children}
    </OverlaysContext.Provider>
  );
}

export function useOverlays(): OverlaysContextValue {
  const context = useContext(OverlaysContext);
  if (!context) {
    throw new Error('useOverlays must be used within an OverlaysProvider');
  }
  return context;
}
