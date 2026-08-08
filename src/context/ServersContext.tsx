import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ServerConnection } from '../lib/storage';
import { loadServers, saveServers } from '../lib/storage';
import type { AuthTokens } from '../api/serverApi';
import { ServerApiError, refreshAccessToken } from '../api/serverApi';

interface ServersContextValue {
  servers: ServerConnection[];
  // Mirrors `servers`, readable synchronously from callbacks (e.g. the map's
  // transformRequest) that can't depend on the latest render's closure.
  serversRef: RefObject<ServerConnection[]>;
  addServer: (baseUrl: string) => ServerConnection;
  updateServer: (id: string, patch: Partial<ServerConnection>) => void;
  removeServer: (id: string) => void;
  // Runs `call` with the given server's current token; if it turns out to be
  // expired, redeems the (single-use) refresh token for a new pair and
  // retries once before giving up and clearing the session (forcing
  // re-login). Concurrent 401s for the same server are deduped into a single
  // shared refresh so the single-use refresh token isn't redeemed twice.
  callWithAuth: <T>(
    serverId: string,
    call: (token: string) => Promise<T>,
  ) => Promise<T>;
}

const ServersContext = createContext<ServersContextValue | null>(null);

export function ServersProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ServerConnection[]>([]);
  const serversRef = useRef<ServerConnection[]>([]);

  // Servers live in IndexedDB, which is async, so the initial load happens
  // after mount. This gates the save effect below so it doesn't fire on the
  // pre-load empty state and wipe stored data.
  const loadedRef = useRef(false);

  // `callWithAuth` (below) needs to read the just-written token synchronously
  // right after `updateServer` - e.g. sign-in immediately followed by a
  // fetch - which a `servers`-driven effect can't guarantee (effects run
  // after the render commits, not synchronously after `setServers`). So
  // every mutation updates `serversRef.current` directly, in lockstep with
  // the state update, instead of relying on an effect to mirror it.
  const applyServers = (
    updater: (prev: ServerConnection[]) => ServerConnection[],
  ) => {
    setServers((prev) => {
      const next = updater(prev);
      serversRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadServers().then((loaded) => {
      if (cancelled) {
        return;
      }
      loadedRef.current = true;
      applyServers(() => loaded);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
    applyServers((prev) => [...prev, server]);
    return server;
  };

  const updateServer = (id: string, patch: Partial<ServerConnection>) => {
    applyServers((prev) =>
      prev.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    );
  };

  const removeServer = (id: string) => {
    applyServers((prev) => prev.filter((server) => server.id !== id));
  };

  // One in-flight refresh promise per server, so concurrent 401s for the
  // same server share a single refresh instead of each redeeming the
  // (single-use) refresh token themselves.
  const refreshInFlightRefs = useRef<Map<string, Promise<AuthTokens>>>(
    new Map(),
  );

  const callWithAuth = async <T,>(
    serverId: string,
    call: (token: string) => Promise<T>,
  ): Promise<T> => {
    const server = serversRef.current.find((s) => s.id === serverId);
    if (!server) {
      throw new Error(`Unknown server: ${serverId}`);
    }
    try {
      return await call(server.token);
    } catch (err) {
      if (!(err instanceof ServerApiError) || err.status !== 401) {
        throw err;
      }
      if (!server.refreshToken) {
        updateServer(serverId, { token: '', refreshToken: '' });
        throw err;
      }
      let refreshed: AuthTokens;
      try {
        let inFlight = refreshInFlightRefs.current.get(serverId);
        if (!inFlight) {
          inFlight = refreshAccessToken(server.baseUrl, server.refreshToken)
            .then((result) => {
              updateServer(serverId, {
                token: result.token,
                refreshToken: result.refreshToken,
              });
              return result;
            })
            .finally(() => {
              refreshInFlightRefs.current.delete(serverId);
            });
          refreshInFlightRefs.current.set(serverId, inFlight);
        }
        refreshed = await inFlight;
      } catch {
        updateServer(serverId, { token: '', refreshToken: '' });
        throw err;
      }
      return call(refreshed.token);
    }
  };

  return (
    <ServersContext.Provider
      value={{
        servers,
        serversRef,
        addServer,
        updateServer,
        removeServer,
        callWithAuth,
      }}
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
