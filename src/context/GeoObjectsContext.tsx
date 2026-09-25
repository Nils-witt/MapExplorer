import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { GeoObjectEntry } from '../types';

interface GeoObjectsContextValue {
  geoObjects: Record<string, GeoObjectEntry[]>;
}

const GeoObjectsContext = createContext<GeoObjectsContextValue | null>(null);

export function GeoObjectsProvider({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      geoObjects: {},
    }),
    [],
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
