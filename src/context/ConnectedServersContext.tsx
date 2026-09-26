import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ConnectedServer } from '../types';
import {
  loadOverlayServers,
  loadUnitServers,
  saveOverlayServers,
  saveUnitServers,
} from '../lib/storage';

const DEFAULT_OVERLAY_SERVERS: ConnectedServer[] = [
  {
    id: 'default-overlay-server',
    baseUrl: 'https://overlays.nilswitt.dev',
    name: 'NW-Tiles-C-01',
  },
];

interface ConnectedServersContextValue {
  unitServers: ConnectedServer[];
  overlayServers: ConnectedServer[];
  setUnitServers: Dispatch<SetStateAction<ConnectedServer[]>>;
  setOverlayServers: Dispatch<SetStateAction<ConnectedServer[]>>;
}

const ConnectedServersContext =
  createContext<ConnectedServersContextValue | null>(null);

export function ConnectedServersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overlayServers, setOverlayServers] = useState<ConnectedServer[]>(
    DEFAULT_OVERLAY_SERVERS,
  );
  const [unitServers, setUnitServers] = useState<ConnectedServer[]>([]);
  // Holds off saving until the stored lists have been read, so the defaults
  // above never overwrite what's already in IndexedDB.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadOverlayServers(), loadUnitServers()]).then(
      ([storedOverlayServers, storedUnitServers]) => {
        if (cancelled) {
          return;
        }
        if (storedOverlayServers) {
          setOverlayServers(storedOverlayServers);
        }
        if (storedUnitServers) {
          setUnitServers(storedUnitServers);
        }
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded) {
      void saveOverlayServers(overlayServers);
    }
  }, [loaded, overlayServers]);

  useEffect(() => {
    if (loaded) {
      void saveUnitServers(unitServers);
    }
  }, [loaded, unitServers]);

  const value = useMemo(
    () => ({
      overlayServers,
      unitServers,
      setOverlayServers,
      setUnitServers,
    }),
    [overlayServers, unitServers],
  );

  return (
    <ConnectedServersContext.Provider value={value}>
      {children}
    </ConnectedServersContext.Provider>
  );
}

export function useConnectedServers(): ConnectedServersContextValue {
  const context = useContext(ConnectedServersContext);
  if (!context) {
    throw new Error(
      'useConnectedServers must be used within a ConnectedServersProvider',
    );
  }
  return context;
}
