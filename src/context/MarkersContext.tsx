import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LocalMarker } from './types';
import { loadMarkers, saveMarkers } from './storage';

interface MarkersContextValue {
  markers: LocalMarker[];
  addMarker: (lng: number, lat: number) => LocalMarker;
  renameMarker: (id: string, name: string) => void;
  removeMarker: (id: string) => void;
  removeAllMarkers: () => void;
  importMarkers: (imported: LocalMarker[]) => void;
  moveMarker: (id: string, lng: number, lat: number) => void;
}

const MarkersContext = createContext<MarkersContextValue | null>(null);

export function MarkersProvider({ children }: { children: ReactNode }) {
  const [markers, setMarkers] = useState<LocalMarker[]>([]);

  // Markers live in IndexedDB, which is async, so the initial load happens
  // after mount. This gates the save effect below so it doesn't fire on the
  // pre-load empty state and wipe stored data.
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadMarkers().then((loaded) => {
      if (cancelled) {
        return;
      }
      loadedRef.current = true;
      setMarkers(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadedRef.current) {
      saveMarkers(markers);
    }
  }, [markers]);

  const addMarker = (lng: number, lat: number): LocalMarker => {
    const marker: LocalMarker = {
      id: `marker-${Date.now()}`,
      lng,
      lat,
      name: 'New marker',
    };
    setMarkers((prev) => [...prev, marker]);
    return marker;
  };

  const renameMarker = (id: string, name: string) => {
    setMarkers((prev) =>
      prev.map((marker) => (marker.id === id ? { ...marker, name } : marker)),
    );
  };

  const removeMarker = (id: string) => {
    setMarkers((prev) => prev.filter((marker) => marker.id !== id));
  };

  const removeAllMarkers = () => {
    setMarkers([]);
  };

  const importMarkers = (imported: LocalMarker[]) => {
    setMarkers((prev) => [...prev, ...imported]);
  };

  const moveMarker = (id: string, lng: number, lat: number) => {
    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === id ? { ...marker, lng, lat } : marker,
      ),
    );
  };

  return (
    <MarkersContext.Provider
      value={{
        markers,
        addMarker,
        renameMarker,
        removeMarker,
        removeAllMarkers,
        importMarkers,
        moveMarker,
      }}
    >
      {children}
    </MarkersContext.Provider>
  );
}

export function useMarkers(): MarkersContextValue {
  const context = useContext(MarkersContext);
  if (!context) {
    throw new Error('useMarkers must be used within a MarkersProvider');
  }
  return context;
}
