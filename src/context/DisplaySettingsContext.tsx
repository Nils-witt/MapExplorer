import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadUnitSymbolSize, saveUnitSymbolSize } from '../lib/storage';

interface DisplaySettingsContextValue {
  // Height of unit symbols on the map, in pixels.
  unitSymbolSize: number;
  setUnitSymbolSize: (size: number) => void;
}

const DisplaySettingsContext =
  createContext<DisplaySettingsContextValue | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [unitSymbolSize, setSize] = useState(loadUnitSymbolSize);

  const value = useMemo(
    () => ({
      unitSymbolSize,
      setUnitSymbolSize: (size: number) => {
        setSize(size);
        saveUnitSymbolSize(size);
      },
    }),
    [unitSymbolSize],
  );

  return (
    <DisplaySettingsContext.Provider value={value}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings(): DisplaySettingsContextValue {
  const context = useContext(DisplaySettingsContext);
  if (!context) {
    throw new Error(
      'useDisplaySettings must be used within a DisplaySettingsProvider',
    );
  }
  return context;
}
