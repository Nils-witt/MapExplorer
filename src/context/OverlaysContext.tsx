import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Overlay } from '../types';
import { loadOverlays, saveOverlays } from '../lib/storage';

interface OverlaysContextValue {
  overlays: Overlay[];
  // Mirrors `overlays`, readable synchronously from callbacks (e.g. the map's
  // transformRequest) that can't depend on the latest render's closure.
  overlaysRef: RefObject<Overlay[]>;
  addOverlay: (
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
    serverId?: string,
    id?: string,
    mapId?: string,
    mapVersion?: string,
  ) => void;
  editOverlay: (
    id: string,
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
    serverId?: string,
    mapId?: string,
    mapVersion?: string,
  ) => void;
  removeOverlay: (id: string) => void;
  toggleOverlay: (id: string) => void;
  changeOverlayOpacity: (id: string, opacity: number) => void;
  moveOverlay: (id: string, direction: 'up' | 'down') => void;
  // Briefly disables and re-enables the currently shown overlays linked to a
  // server, forcing MapLibre to unmount/remount their tile sources so the
  // next tile request re-resolves the (now updated) authorization header.
  refreshServerOverlays: (serverId: string) => void;
}

const OverlaysContext = createContext<OverlaysContextValue | null>(null);

export function OverlaysProvider({ children }: { children: ReactNode }) {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const overlaysRef = useRef<Overlay[]>([]);

  // Overlays live in IndexedDB, which is async, so the initial load happens
  // after mount. This gates the save effect below so it doesn't fire on the
  // pre-load empty state and wipe stored data.
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadOverlays().then((loaded) => {
      if (cancelled) {
        return;
      }
      loadedRef.current = true;
      setOverlays(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    overlaysRef.current = overlays;
    if (loadedRef.current) {
      saveOverlays(overlays);
    }
  }, [overlays]);

  const toggleOverlay = useCallback((id: string) => {
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id ? { ...overlay, enabled: !overlay.enabled } : overlay,
      ),
    );
  }, []);

  const refreshServerOverlays = useCallback((serverId: string) => {
    setOverlays((prev) => {
      const idsToRefresh = prev
        .filter((overlay) => overlay.serverId === serverId && overlay.enabled)
        .map((overlay) => overlay.id);
      if (idsToRefresh.length === 0) {
        return prev;
      }
      // Re-enable on the next tick so the disable commits (and MapLibre
      // unmounts the source) before the source is remounted - doing both in
      // the same tick would batch into a no-op.
      setTimeout(() => {
        setOverlays((current) =>
          current.map((overlay) =>
            idsToRefresh.includes(overlay.id)
              ? { ...overlay, enabled: true }
              : overlay,
          ),
        );
      }, 0);
      return prev.map((overlay) =>
        idsToRefresh.includes(overlay.id)
          ? { ...overlay, enabled: false }
          : overlay,
      );
    });
  }, []);

  const addOverlay = useCallback(
    (
      name: string,
      tilesUrl: string,
      authorizationHeader?: string,
      serverId?: string,
      id?: string,
      mapId?: string,
      mapVersion?: string,
    ) => {
      setOverlays((prev) => [
        ...prev,
        {
          id: id ?? `custom-${Date.now()}`,
          name,
          tiles: [tilesUrl],
          enabled: true,
          authorizationHeader: authorizationHeader || undefined,
          serverId: serverId || undefined,
          mapId: mapId || undefined,
          mapVersion: mapVersion || undefined,
        },
      ]);
    },
    [],
  );

  const changeOverlayOpacity = useCallback((id: string, opacity: number) => {
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id ? { ...overlay, opacity } : overlay,
      ),
    );
  }, []);

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
  }, []);

  const moveOverlay = useCallback((id: string, direction: 'up' | 'down') => {
    setOverlays((prev) => {
      const index = prev.findIndex((overlay) => overlay.id === id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const editOverlay = useCallback(
    (
      id: string,
      name: string,
      tilesUrl: string,
      authorizationHeader?: string,
      serverId?: string,
      mapId?: string,
      mapVersion?: string,
    ) => {
      const tiles = tilesUrl
        .split(',')
        .map((tile) => tile.trim())
        .filter(Boolean);
      setOverlays((prev) =>
        prev.map((overlay) =>
          overlay.id === id
            ? {
                ...overlay,
                name,
                tiles,
                authorizationHeader: authorizationHeader || undefined,
                // Preserve the existing server link when the caller doesn't
                // pass one (e.g. the generic Settings edit form only touches
                // name/tiles/auth) - only an explicit value should change it.
                serverId: serverId || overlay.serverId,
                mapId: mapId || overlay.mapId,
                mapVersion: mapVersion || overlay.mapVersion,
              }
            : overlay,
        ),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({
      overlays,
      overlaysRef,
      addOverlay,
      editOverlay,
      removeOverlay,
      toggleOverlay,
      changeOverlayOpacity,
      moveOverlay,
      refreshServerOverlays,
    }),
    [
      overlays,
      addOverlay,
      editOverlay,
      removeOverlay,
      toggleOverlay,
      changeOverlayOpacity,
      moveOverlay,
      refreshServerOverlays,
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
