import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  loadUnitDisplayMode,
  loadUnitSymbolSize,
  saveUnitDisplayMode,
  saveUnitSymbolSize,
  type UnitDisplayMode,
} from '../lib/storage';

interface DisplaySettingsContextValue {
  // Height of unit symbols on the map, in pixels. 3D models are scaled to
  // be at least this long on screen.
  unitSymbolSize: number;
  setUnitSymbolSize: (size: number) => void;
  // Whether units are drawn as 2D symbols or 3D models.
  unitDisplayMode: UnitDisplayMode;
  setUnitDisplayMode: (mode: UnitDisplayMode) => void;
}

const DisplaySettingsContext =
  createContext<DisplaySettingsContextValue | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [unitSymbolSize, setSize] = useState(loadUnitSymbolSize);
  const [unitDisplayMode, setMode] = useState(loadUnitDisplayMode);

  const value = useMemo(
    () => ({
      unitSymbolSize,
      setUnitSymbolSize: (size: number) => {
        setSize(size);
        saveUnitSymbolSize(size);
      },
      unitDisplayMode,
      setUnitDisplayMode: (mode: UnitDisplayMode) => {
        setMode(mode);
        saveUnitDisplayMode(mode);
      },
    }),
    [unitSymbolSize, unitDisplayMode],
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
