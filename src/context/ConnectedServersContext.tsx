import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ConnectedServer } from '../types';
import {
  CONFIGURED_OVERLAY_SERVER_ID,
  CONFIGURED_UNIT_SERVER_ID,
  type ConfiguredServers,
  loadConfiguredServers,
} from '../lib/config';
import {
  loadOverlayServers,
  loadUnitServers,
  saveOverlayServers,
  saveUnitServers,
} from '../lib/storage';

// Brings the server the deployment configures (see loadConfiguredServers)
// into a list: added or updated from the config, or dropped once the config
// no longer names one. `configured` is undefined when the config couldn't be
// loaded, which leaves the list as it is.
function withConfiguredServer(
  servers: ConnectedServer[],
  id: string,
  configured: ConnectedServer | null | undefined,
): ConnectedServer[] {
  if (configured === undefined) {
    return servers;
  }
  const others = servers.filter((server) => server.id !== id);
  if (!configured) {
    return others;
  }
  return servers.some((server) => server.id === id)
    ? servers.map((server) => (server.id === id ? configured : server))
    : [configured, ...others];
}

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
  const [overlayServers, setOverlayServers] = useState<ConnectedServer[]>([]);
  const [unitServers, setUnitServers] = useState<ConnectedServer[]>([]);
  // Holds off saving until the stored lists have been read, so the empty
  // lists above never overwrite what's already in IndexedDB.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const configured = loadConfiguredServers().catch(
      (error: unknown): Partial<ConfiguredServers> => {
        console.error('Failed to load the configured servers:', error);
        return {};
      },
    );
    void Promise.all([
      loadOverlayServers(),
      loadUnitServers(),
      configured,
    ]).then(
      ([
        storedOverlayServers,
        storedUnitServers,
        { overlayServer, unitServer },
      ]) => {
        if (cancelled) {
          return;
        }
        setOverlayServers(
          withConfiguredServer(
            storedOverlayServers ?? [],
            CONFIGURED_OVERLAY_SERVER_ID,
            overlayServer,
          ),
        );
        setUnitServers(
          withConfiguredServer(
            storedUnitServers ?? [],
            CONFIGURED_UNIT_SERVER_ID,
            unitServer,
          ),
        );
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
