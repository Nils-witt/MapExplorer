import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ServerConnection } from '../lib/storage';
import { loadServers, saveServers } from '../lib/storage';

interface ServersContextValue {
  servers: ServerConnection[];
  // Mirrors `servers`, readable synchronously from callbacks (e.g. the map's
  // transformRequest) that can't depend on the latest render's closure.
  serversRef: RefObject<ServerConnection[]>;
  addServer: (baseUrl: string) => ServerConnection;
  updateServer: (id: string, patch: Partial<ServerConnection>) => void;
  removeServer: (id: string) => void;
}

const ServersContext = createContext<ServersContextValue | null>(null);

export function ServersProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ServerConnection[]>([]);
  const serversRef = useRef<ServerConnection[]>([]);

  // Servers live in IndexedDB, which is async, so the initial load happens
  // after mount. This gates the save effect below so it doesn't fire on the
  // pre-load empty state and wipe stored data.
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadServers().then((loaded) => {
      if (cancelled) {
        return;
      }
      loadedRef.current = true;
      setServers(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    serversRef.current = servers;
    if (loadedRef.current) {
      saveServers(servers);
    }
  }, [servers]);

  const addServer = (baseUrl: string): ServerConnection => {
    const server: ServerConnection = {
      id: crypto.randomUUID(),
      baseUrl,
      username: '',
      token: '',
      refreshToken: '',
    };
    setServers((prev) => [...prev, server]);
    return server;
  };

  const updateServer = (id: string, patch: Partial<ServerConnection>) => {
    setServers((prev) =>
      prev.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    );
  };

  const removeServer = (id: string) => {
    setServers((prev) => prev.filter((server) => server.id !== id));
  };

  return (
    <ServersContext.Provider
      value={{ servers, serversRef, addServer, updateServer, removeServer }}
    >
      {children}
    </ServersContext.Provider>
  );
}

export function useServers(): ServersContextValue {
  const context = useContext(ServersContext);
  if (!context) {
    throw new Error('useServers must be used within a ServersProvider');
  }
  return context;
}
