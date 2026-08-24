import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ServerConnection } from '../lib/storage';
import { loadServers, saveServers } from '../lib/storage';
import type { AuthTokens } from '../api/serverApi';
import { ServerApiError, listMaps, refreshAccessToken } from '../api/serverApi';

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
  // Message per server whose session was just force-cleared because its
  // refresh token was missing or rejected - surfaced globally (not tied to
  // whatever UI happened to trigger the failed call) so a token that expires
  // silently, e.g. during the onLoad validation pass, still reaches the
  // user. Cleared automatically once the server signs in again.
  authErrors: Record<string, string>;
  dismissAuthError: (serverId: string) => void;
}

const ServersContext = createContext<ServersContextValue | null>(null);

export function ServersProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<ServerConnection[]>([]);
  const serversRef = useRef<ServerConnection[]>([]);
  const [authErrors, setAuthErrors] = useState<Record<string, string>>({});

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
  const applyServers = useCallback(
    (updater: (prev: ServerConnection[]) => ServerConnection[]) => {
      setServers((prev) => {
        const next = updater(prev);
        serversRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadServers().then((loaded) => {
      if (cancelled) {
        return;
      }
      loadedRef.current = true;
      applyServers(() => loaded);
      // Validate every stored session's access token as soon as the app
      // loads, instead of waiting for something that uses it (a map tile
      // request, an authenticated call) to fail first - tile requests in
      // particular read the token straight off the server connection and
      // never trigger a refresh themselves, so a token that expired while
      // the app was closed would otherwise just serve broken tiles until
      // the user happens to open Settings.
      loaded.forEach((server) => {
        if (!server.token) {
          return;
        }
        callWithAuth(server.id, (t) => listMaps(server.baseUrl, t)).catch(
          () => {
            // callWithAuth already clears the session on a failed refresh -
            // this call exists only to trigger that, nothing else to do.
          },
        );
      });
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

  const addServer = useCallback(
    (baseUrl: string): ServerConnection => {
      const server: ServerConnection = {
        id: crypto.randomUUID(),
        baseUrl,
        username: '',
        token: '',
        refreshToken: '',
      };
      applyServers((prev) => [...prev, server]);
      return server;
    },
    [applyServers],
  );

  const updateServer = useCallback(
    (id: string, patch: Partial<ServerConnection>) => {
      applyServers((prev) =>
        prev.map((server) =>
          server.id === id ? { ...server, ...patch } : server,
        ),
      );
      // A fresh sign-in (or re-link) supersedes whatever auth error sent
      // the user back to it.
      if (patch.token) {
        setAuthErrors((prev) => {
          if (!(id in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [applyServers],
  );

  const dismissAuthError = useCallback((serverId: string) => {
    setAuthErrors((prev) => {
      if (!(serverId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  }, []);

  const removeServer = useCallback(
    (id: string) => {
      applyServers((prev) => prev.filter((server) => server.id !== id));
    },
    [applyServers],
  );

  // One in-flight refresh promise per server, so concurrent 401s for the
  // same server share a single refresh instead of each redeeming the
  // (single-use) refresh token themselves.
  const refreshInFlightRefs = useRef<Map<string, Promise<AuthTokens>>>(
    new Map(),
  );

  const callWithAuth = useCallback(
    async <T,>(
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
          setAuthErrors((prev) => ({
            ...prev,
            [serverId]: `Session for ${server.baseUrl} expired. Please sign in again.`,
          }));
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
          setAuthErrors((prev) => ({
            ...prev,
            [serverId]: `Session for ${server.baseUrl} could not be refreshed. Please sign in again.`,
          }));
          throw err;
        }
        return call(refreshed.token);
      }
    },
    [updateServer],
  );

  const value = useMemo(
    () => ({
      servers,
      serversRef,
      addServer,
      updateServer,
      removeServer,
      callWithAuth,
      authErrors,
      dismissAuthError,
    }),
    [
      servers,
      addServer,
      updateServer,
      removeServer,
      callWithAuth,
      authErrors,
      dismissAuthError,
    ],
  );

  return (
    <ServersContext.Provider value={value}>{children}</ServersContext.Provider>
  );
}

export function useServers(): ServersContextValue {
  const context = useContext(ServersContext);
  if (!context) {
    throw new Error('useServers must be used within a ServersProvider');
  }
  return context;
}
