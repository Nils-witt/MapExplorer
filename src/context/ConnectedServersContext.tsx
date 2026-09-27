import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ConnectedServer } from '../types';
import {
  CONFIGURED_OVERLAY_SERVER_ID,
  CONFIGURED_UNIT_SERVER_ID,
  type ConfiguredServers,
  isConfiguredServerId,
  loadConfiguredServers,
} from '../lib/config';
import {
  loadOverlayServers,
  loadUnitServers,
  saveOverlayServers,
  saveUnitServers,
} from '../lib/storage';

// Brings the servers the deployment configures (see loadConfiguredServers)
// into a list: added or updated from the config, or dropped once the config
// no longer names them. `configured` is undefined when the config couldn't
// be loaded, which leaves the list as it is. Whether the user disabled one is
// kept.
function withConfiguredServers(
  servers: ConnectedServer[],
  prefix: string,
  configured: ConnectedServer[] | undefined,
): ConnectedServer[] {
  if (configured === undefined) {
    return servers;
  }
  // The server configured before config.json could list several keeps its
  // id while its url is still configured, and with it its cached overlays.
  const legacy = servers.find((server) => server.id === prefix);
  const byId = new Map(
    configured.map((server) => {
      const id = server.baseUrl === legacy?.baseUrl ? prefix : server.id;
      return [id, { ...server, id }];
    }),
  );
  const kept = servers.flatMap((server) => {
    if (!isConfiguredServerId(server.id, prefix)) {
      return [server];
    }
    const current = byId.get(server.id);
    byId.delete(server.id);
    return current ? [{ ...current, enabled: server.enabled }] : [];
  });
  return [...byId.values(), ...kept];
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
        {
          overlayServers: configuredOverlayServers,
          unitServers: configuredUnitServers,
        },
      ]) => {
        if (cancelled) {
          return;
        }
        setOverlayServers(
          withConfiguredServers(
            storedOverlayServers ?? [],
            CONFIGURED_OVERLAY_SERVER_ID,
            configuredOverlayServers,
          ),
        );
        setUnitServers(
          withConfiguredServers(
            storedUnitServers ?? [],
            CONFIGURED_UNIT_SERVER_ID,
            configuredUnitServers,
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
