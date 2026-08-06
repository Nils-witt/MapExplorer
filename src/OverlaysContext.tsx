import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Overlay } from './types';
import { loadOverlays, saveOverlays } from './storage';

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
  ) => void;
  editOverlay: (
    id: string,
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
    serverId?: string,
  ) => void;
  removeOverlay: (id: string) => void;
  toggleOverlay: (id: string) => void;
  changeOverlayOpacity: (id: string, opacity: number) => void;
  moveOverlay: (id: string, direction: 'up' | 'down') => void;
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

  const toggleOverlay = (id: string) => {
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id ? { ...overlay, enabled: !overlay.enabled } : overlay,
      ),
    );
  };

  const addOverlay = (
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
    serverId?: string,
    id?: string,
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
      },
    ]);
  };

  const changeOverlayOpacity = (id: string, opacity: number) => {
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id ? { ...overlay, opacity } : overlay,
      ),
    );
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
  };

  const moveOverlay = (id: string, direction: 'up' | 'down') => {
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
  };

  const editOverlay = (
    id: string,
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
    serverId?: string,
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
              serverId: serverId || undefined,
            }
          : overlay,
      ),
    );
  };

  return (
    <OverlaysContext.Provider
      value={{
        overlays,
        overlaysRef,
        addOverlay,
        editOverlay,
        removeOverlay,
        toggleOverlay,
        changeOverlayOpacity,
        moveOverlay,
      }}
    >
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
