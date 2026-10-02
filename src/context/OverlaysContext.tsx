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
import type { GeoJSON } from 'geojson';
import { useConnectedServers } from './ConnectedServersContext.tsx';
import {
  type OverlayGeoObject,
  type OverlayMap,
  type OverlayMapVersionBounds,
  OverlayServer,
} from '../api/OverlayServer.ts';
import { type ConnectedServer, isServerEnabled } from '../types.ts';
import { useServerAuth } from './ServerAuthContext.tsx';
import {
  loadAvailableOverlays,
  loadGeoObjects,
  loadOverlayLayers,
  type OverlayLayerData,
  saveAvailableOverlays,
  saveGeoObjects,
  saveOverlayLayers,
} from '../lib/storage.ts';
import { layerColor } from '../lib/layerColors.ts';

export const DEFAULT_OVERLAY_OPACITY = 0.8;

// An enabled overlay resolved to what the map needs to draw it.
export interface EnabledOverlay {
  id: string;
  name: string;
  serverId: string;
  // The version drawn.
  version: string;
  tiles: string[];
  // The drawn version's tile extent, if the server has computed it.
  bounds?: OverlayMapVersionBounds;
  opacity: number;
  // The drawn version's GeoJSON layers the user hasn't switched off, in the
  // server's order.
  layers: EnabledOverlayLayer[];
}

export interface EnabledOverlayLayer {
  name: string;
  color: string;
  data: GeoJSON;
}

// A GeoJSON layer as listed in the settings.
export interface OverlayLayerInfo {
  name: string;
  // The layer's own color, or one from the palette.
  color: string;
}

interface OverlaysContextValue {
  overlays: Record<string, OverlayMap[]>;
  enabledOverlayIds: string[];
  setOverlayEnabled: (overlayId: string, enabled: boolean) => void;
  // Moves an enabled overlay one step up (drawn above the next one) or down
  // in the draw order.
  moveOverlay: (overlayId: string, direction: 'up' | 'down') => void;
  getOverlayOpacity: (overlayId: string) => number;
  setOverlayOpacity: (overlayId: string, opacity: number) => void;
  // The version drawn for an overlay: the one the user picked, or its
  // currentVersion.
  getOverlayVersion: (overlay: OverlayMap) => string;
  setOverlayVersion: (overlay: OverlayMap, version: string) => void;
  // Enabled overlays in draw order, bottom first. Newly enabled overlays
  // are added on top.
  enabledOverlays: EnabledOverlay[];
  // Geo objects of every version of every known overlay.
  geoObjects: GeoObjectsByServer;
  // The GeoJSON layers of the version drawn for an overlay, as last fetched
  // from the given server. Empty until the overlay has been enabled.
  getOverlayLayers: (
    serverId: string,
    overlay: OverlayMap,
  ) => OverlayLayerInfo[];
  isLayerVisible: (overlayId: string, name: string) => boolean;
  setLayerVisible: (overlayId: string, name: string, visible: boolean) => void;
}

// Geo objects by server id, overlay id and version, in that order.
export type GeoObjectsByServer = Record<
  string,
  Record<string, Record<string, OverlayGeoObject[]>>
>;

// GeoJSON layers by server id, overlay id and version, in that order.
export type LayersByServer = Record<
  string,
  Record<string, Record<string, OverlayLayerData[]>>
>;

// Resolves each layer's color: its own, or the palette's by its place in
// the version's list (as tileserve-go's frontend does).
function resolveLayerColors(layers: OverlayLayerData[]) {
  return layers.map((layer, index) => ({
    ...layer,
    color: layer.color ?? layerColor(index),
  }));
}

const OverlaysContext = createContext<OverlaysContextValue | null>(null);

export function OverlaysProvider({ children }: { children: ReactNode }) {
  const { overlayServers: allOverlayServers } = useConnectedServers();
  const { tokens } = useServerAuth();
  // Only these are fetched from and drawn. Disabled servers keep their
  // cached overlays and geo objects for when they're enabled again.
  const overlayServers = useMemo(
    () => allOverlayServers.filter(isServerEnabled),
    [allOverlayServers],
  );

  const [overlays, setOverlays] = useState<Record<string, OverlayMap[]>>({});
  // Read by the overlay fetch to reuse known tile counts: a version's tiles
  // never change, so its count is only fetched once.
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);
  const [enabledOverlayIds, setEnabledOverlayIds] = useState<string[]>([]);
  const [overlayOpacities, setOverlayOpacities] = useState<
    Record<string, number>
  >({});
  const [overlayVersions, setOverlayVersions] = useState<
    Record<string, string>
  >({});
  const [geoObjects, setGeoObjects] = useState<GeoObjectsByServer>({});
  const [layers, setLayers] = useState<LayersByServer>({});
  // Read by the layer fetch to reuse unchanged documents without refetching
  // whenever the layers change.
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const [overlayHiddenLayers, setOverlayHiddenLayers] = useState<
    Record<string, string[]>
  >({});
  // Holds off saving until the cached overlays and geo objects have been
  // read, so the empty initial state never overwrites what's already in
  // IndexedDB.
  const [cacheLoaded, setCacheLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadAvailableOverlays(),
      loadGeoObjects(),
      loadOverlayLayers(),
    ]).then(([cached, cachedGeoObjects, cachedLayers]) => {
      if (cancelled) {
        return;
      }
      // Anything fetched in the meantime is fresher than the cache. Layers
      // are only fetched once the cache is loaded.
      setOverlays((prev) => ({ ...cached.overlays, ...prev }));
      setGeoObjects((prev) => ({ ...cachedGeoObjects, ...prev }));
      setLayers(cachedLayers);
      setEnabledOverlayIds(cached.enabledOverlayIds);
      setOverlayOpacities(cached.overlayOpacities);
      setOverlayVersions(cached.overlayVersions);
      setOverlayHiddenLayers(cached.overlayHiddenLayers);
      setCacheLoaded(true);
    });
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
          const ovS = new OverlayServer(
            server.baseUrl,
            () => tokens[server.id] ?? null,
          );
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
          await Promise.all(
            maps.flatMap((map) =>
              map.versions.map(async (version) => {
                const known = overlaysRef.current[server.id]
                  ?.find(({ uuid }) => uuid === map.uuid)
                  ?.versions.find(
                    (v) => v.version === version.version,
                  )?.tileCount;
                if (known !== undefined) {
                  version.tileCount = known;
                  return;
                }
                try {
                  const tiles = await ovS.listTiles(
                    map.uuid,
                    version.version,
                    controller.signal,
                  );
                  version.tileCount = tiles.length;
                } catch (error) {
                  if (!controller.signal.aborted) {
                    console.error(
                      `Error occurred while fetching the tile list of overlay ${map.name} version ${version.version} from server ${server.name}:`,
                      error,
                    );
                  }
                }
              }),
            ),
          );
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
      // Servers that couldn't be reached or are disabled keep their last
      // known overlays and geo objects; servers no longer configured are
      // dropped.
      setOverlays((prev) => {
        const next: Record<string, OverlayMap[]> = {};
        for (const server of allOverlayServers) {
          const list = fetched[server.id] ?? prev[server.id];
          if (list) {
            next[server.id] = list;
          }
        }
        return next;
      });
      setGeoObjects((prev) => {
        const next: GeoObjectsByServer = {};
        for (const server of allOverlayServers) {
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
      // Same for layers, which only exist for versions that were drawn.
      setLayers((prev) => {
        const next: LayersByServer = {};
        for (const server of allOverlayServers) {
          const maps = fetched[server.id];
          if (!maps) {
            if (prev[server.id]) {
              next[server.id] = prev[server.id];
            }
            continue;
          }
          const serverLayers: LayersByServer[string] = {};
          for (const map of maps) {
            for (const { version } of map.versions) {
              const list = prev[server.id]?.[map.uuid]?.[version];
              if (list) {
                (serverLayers[map.uuid] ??= {})[version] = list;
              }
            }
          }
          next[server.id] = serverLayers;
        }
        return next;
      });
    };

    void fetchOverlays();

    return () => {
      controller.abort();
    };
  }, [allOverlayServers, overlayServers, tokens]);

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
        overlayHiddenLayers,
      });
    }
  }, [
    cacheLoaded,
    overlays,
    enabledOverlayIds,
    overlayOpacities,
    overlayVersions,
    overlayHiddenLayers,
  ]);

  useEffect(() => {
    if (cacheLoaded) {
      void saveGeoObjects(geoObjects);
    }
  }, [cacheLoaded, geoObjects]);

  useEffect(() => {
    if (cacheLoaded) {
      void saveOverlayLayers(layers);
    }
  }, [cacheLoaded, layers]);

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

  // Fetches the GeoJSON layers of each enabled overlay's drawn version.
  // Documents are only downloaded when new or updated since cached.
  useEffect(() => {
    if (!cacheLoaded) {
      return;
    }
    const controller = new AbortController();
    const fetchLayers = async () => {
      const fetched: {
        serverId: string;
        overlayId: string;
        version: string;
        list: OverlayLayerData[];
      }[] = [];
      await Promise.all(
        enabledSources.map(async ({ overlay, server, version }) => {
          const ovS = new OverlayServer(
            server.baseUrl,
            () => tokens[server.id] ?? null,
          );
          const cached =
            layersRef.current[server.id]?.[overlay.uuid]?.[version] ?? [];
          try {
            const listed = await ovS.listLayers(
              overlay.uuid,
              version,
              controller.signal,
            );
            const list = await Promise.all(
              listed.map(async (layer): Promise<OverlayLayerData | null> => {
                const previous = cached.find((c) => c.name === layer.name);
                if (previous && previous.updatedAt === layer.updatedAt) {
                  return { ...layer, data: previous.data };
                }
                try {
                  const data = await ovS.getLayer(
                    overlay.uuid,
                    version,
                    layer.name,
                    controller.signal,
                  );
                  return { ...layer, data };
                } catch (error) {
                  if (!controller.signal.aborted) {
                    console.error(
                      `Error occurred while fetching layer ${layer.name} of overlay ${overlay.name} version ${version} from server ${server.name}:`,
                      error,
                    );
                  }
                  // Better an outdated copy than none.
                  return previous ?? null;
                }
              }),
            );
            fetched.push({
              serverId: server.id,
              overlayId: overlay.uuid,
              version,
              list: list.filter((layer) => layer !== null),
            });
          } catch (error) {
            // The version keeps its last known layers.
            if (!controller.signal.aborted) {
              console.error(
                `Error occurred while fetching layers of overlay ${overlay.name} version ${version} from server ${server.name}:`,
                error,
              );
            }
          }
        }),
      );
      if (controller.signal.aborted || fetched.length === 0) {
        return;
      }
      setLayers((prev) => {
        const next: LayersByServer = { ...prev };
        for (const { serverId, overlayId, version, list } of fetched) {
          next[serverId] = {
            ...next[serverId],
            [overlayId]: { ...next[serverId]?.[overlayId], [version]: list },
          };
        }
        return next;
      });
    };

    void fetchLayers();

    return () => {
      controller.abort();
    };
  }, [cacheLoaded, enabledSources, tokens]);

  const isLayerVisible = useCallback(
    (overlayId: string, name: string) =>
      !overlayHiddenLayers[overlayId]?.includes(name),
    [overlayHiddenLayers],
  );

  const setLayerVisible = useCallback(
    (overlayId: string, name: string, visible: boolean) => {
      setOverlayHiddenLayers((prev) => {
        const without = (prev[overlayId] ?? []).filter((n) => n !== name);
        const hidden = visible ? without : [...without, name];
        const next = { ...prev };
        if (hidden.length > 0) {
          next[overlayId] = hidden;
        } else {
          delete next[overlayId];
        }
        return next;
      });
    },
    [],
  );

  const getOverlayLayers = useCallback(
    (serverId: string, overlay: OverlayMap): OverlayLayerInfo[] =>
      resolveLayerColors(
        layers[serverId]?.[overlay.uuid]?.[getOverlayVersion(overlay)] ?? [],
      ).map(({ name, color }) => ({ name, color })),
    [layers, getOverlayVersion],
  );

  const moveOverlay = useCallback(
    (overlayId: string, direction: 'up' | 'down') => {
      // Swap with the nearest neighbor that's actually drawn, skipping
      // overlays whose server is unreachable.
      const drawnIds = new Set(
        enabledSources.map(({ overlay }) => overlay.uuid),
      );
      setEnabledOverlayIds((prev) => {
        const index = prev.indexOf(overlayId);
        if (index === -1) {
          return prev;
        }
        const step = direction === 'up' ? 1 : -1;
        let other = index + step;
        while (
          other >= 0 &&
          other < prev.length &&
          !drawnIds.has(prev[other])
        ) {
          other += step;
        }
        if (other < 0 || other >= prev.length) {
          return prev;
        }
        const next = [...prev];
        [next[index], next[other]] = [next[other], next[index]];
        return next;
      });
    },
    [enabledSources],
  );

  const enabledOverlays = useMemo(
    () =>
      enabledSources.map(({ overlay, server, version }): EnabledOverlay => {
        const baseUrl = server.baseUrl.replace(/\/+$/, '');
        return {
          id: overlay.uuid,
          name: overlay.name,
          serverId: server.id,
          version,
          tiles: [
            `${baseUrl}/maps/${overlay.uuid}/version/${version}/{z}/{x}/{y}.png`,
          ],
          bounds: overlay.versions.find((v) => v.version === version)?.bounds,
          opacity: getOverlayOpacity(overlay.uuid),
          layers: resolveLayerColors(
            layers[server.id]?.[overlay.uuid]?.[version] ?? [],
          )
            .filter(({ name }) => isLayerVisible(overlay.uuid, name))
            .map(({ name, color, data }) => ({ name, color, data })),
        };
      }),
    [enabledSources, getOverlayOpacity, layers, isLayerVisible],
  );

  // What's cached for disabled servers isn't passed on.
  const activeOverlays = useMemo(
    () =>
      Object.fromEntries(
        overlayServers
          .filter((server) => overlays[server.id])
          .map((server) => [server.id, overlays[server.id]]),
      ),
    [overlayServers, overlays],
  );
  const activeGeoObjects = useMemo(
    () =>
      Object.fromEntries(
        overlayServers
          .filter((server) => geoObjects[server.id])
          .map((server) => [server.id, geoObjects[server.id]]),
      ),
    [overlayServers, geoObjects],
  );

  const value = useMemo(
    () => ({
      overlays: activeOverlays,
      enabledOverlayIds,
      setOverlayEnabled,
      moveOverlay,
      getOverlayOpacity,
      setOverlayOpacity,
      getOverlayVersion,
      setOverlayVersion,
      enabledOverlays,
      geoObjects: activeGeoObjects,
      getOverlayLayers,
      isLayerVisible,
      setLayerVisible,
    }),
    [
      activeOverlays,
      enabledOverlayIds,
      setOverlayEnabled,
      moveOverlay,
      getOverlayOpacity,
      setOverlayOpacity,
      getOverlayVersion,
      setOverlayVersion,
      enabledOverlays,
      activeGeoObjects,
      getOverlayLayers,
      isLayerVisible,
      setLayerVisible,
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
