import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { OverlayServer, OverlayServerError } from '../api/OverlayServer';
import { UnitServer } from '../api/UnitServer';
import type { ConnectedServer } from '../types';
import {
  loadServerSessions,
  saveServerSessions,
  SERVER_SESSIONS_STORAGE_KEY,
  type ServerSession,
} from '../lib/storage';
import { useAuth } from './AuthContext';
import { useConnectedServers } from './ConnectedServersContext';

interface ServerAuthContextValue {
  // Sessions from signing in to a server directly, by server id.
  sessions: Record<string, ServerSession>;
  // The bearer token for each connected server, by server id: its own
  // session's if signed in to it, otherwise the SSO token, or null.
  tokens: Record<string, string | null>;
  login: (
    server: ConnectedServer,
    kind: ServerSession['kind'],
    username: string,
    password: string,
  ) => Promise<void>;
  // Forgets the server's own session; it falls back to SSO, if enabled.
  logout: (server: ConnectedServer) => Promise<void>;
}

const ServerAuthContext = createContext<ServerAuthContextValue | null>(null);

// Milliseconds of remaining token lifetime below which an overlay server
// session is refreshed; matches RENEW_THRESHOLD_SECONDS in lib/oidc.ts.
const RENEW_THRESHOLD_MS = 60_000;
// setTimeout fires immediately for longer delays.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Sessions are read back from storage before every change, so a change made
// by another tab in the meantime isn't lost.
function updateStoredSession(
  serverId: string,
  session: ServerSession | null,
): Record<string, ServerSession> {
  const sessions = loadServerSessions();
  if (session) {
    sessions[serverId] = session;
  } else {
    delete sessions[serverId];
  }
  saveServerSessions(sessions);
  return sessions;
}

function withRenewLock<T>(serverId: string, task: () => Promise<T>) {
  if (!('locks' in navigator)) {
    return task();
  }
  return navigator.locks.request(`server-token-renewal:${serverId}`, task);
}

// Redeems an overlay server session's refresh token. Tabs share the stored
// sessions and refresh tokens are single-use, so renewals are serialized
// across tabs and a tab that waited picks up the tokens the first one
// stored. Resolves to the stored sessions if this changed them, or null.
function refreshOverlaySession(
  serverId: string,
  baseUrl: string,
): Promise<Record<string, ServerSession> | null> {
  return withRenewLock(serverId, async () => {
    const stored = loadServerSessions()[serverId];
    if (
      !stored?.refreshToken ||
      (stored.expiresAt !== null &&
        stored.expiresAt - Date.now() > RENEW_THRESHOLD_MS)
    ) {
      // Another tab renewed it while this one waited for the lock; the
      // storage event brings the change here.
      return null;
    }
    try {
      const renewed = await OverlayServer.refresh(baseUrl, stored.refreshToken);
      return updateStoredSession(serverId, {
        ...stored,
        token: renewed.token,
        refreshToken: renewed.refreshToken ?? undefined,
        expiresAt: renewed.expiresAt,
      });
    } catch (err) {
      if (err instanceof OverlayServerError && err.status === 401) {
        // The refresh token is no longer valid; retrying is pointless.
        console.log(`Session for ${baseUrl} can no longer be renewed`, err);
        return updateStoredSession(serverId, null);
      }
      // Most likely offline; keep the session so the app keeps working
      // from its cached data, and retry once back online.
      console.warn(`Renewing the session for ${baseUrl} failed`, err);
      return null;
    }
  });
}

export function ServerAuthProvider({ children }: { children: ReactNode }) {
  const { accessToken, ssoEnabled } = useAuth();
  const { overlayServers, unitServers } = useConnectedServers();
  // localStorage is read synchronously, so there is no empty initial state
  // that could overwrite it.
  const [sessions, setSessions] = useState(loadServerSessions);

  // Signing in or out in another tab applies here too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SERVER_SESSIONS_STORAGE_KEY || event.key === null) {
        setSessions(loadServerSessions());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Refreshes overlay server sessions shortly before they expire, and drops
  // sessions that can't be refreshed once they have.
  useEffect(() => {
    const servers = new Map(
      [...overlayServers, ...unitServers].map((server) => [server.id, server]),
    );
    const due = Object.entries(sessions).flatMap(([serverId, session]) => {
      const server = servers.get(serverId);
      if (!server || session.expiresAt === null) {
        return [];
      }
      const at = session.refreshToken
        ? session.expiresAt - RENEW_THRESHOLD_MS
        : session.expiresAt;
      return [{ server, session, at }];
    });
    const renew = (server: ConnectedServer, session: ServerSession) => {
      if (session.refreshToken) {
        void refreshOverlaySession(server.id, server.baseUrl).then(
          (updated) => {
            if (updated) {
              setSessions(updated);
            }
          },
        );
      } else {
        setSessions(updateStoredSession(server.id, null));
      }
    };
    const timers = due.map(({ server, session, at }) =>
      setTimeout(
        () => renew(server, session),
        Math.min(Math.max(0, at - Date.now()), MAX_TIMEOUT_MS),
      ),
    );
    // A renewal that failed while offline won't be retried by the timers.
    const onOnline = () => {
      for (const { server, session, at } of due) {
        if (session.refreshToken && at <= Date.now()) {
          renew(server, session);
        }
      }
    };
    window.addEventListener('online', onOnline);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('online', onOnline);
    };
  }, [sessions, overlayServers, unitServers]);

  // Serialized so the map stays the same object while no token changes,
  // e.g. when an unrelated server is added; effects depend on it.
  const tokensKey = JSON.stringify(
    Object.fromEntries(
      [...overlayServers, ...unitServers].map((server) => [
        server.id,
        sessions[server.id]?.token ?? (ssoEnabled ? accessToken : null),
      ]),
    ),
  );
  const tokens = useMemo(
    () => JSON.parse(tokensKey) as Record<string, string | null>,
    [tokensKey],
  );

  const login = useCallback(
    async (
      server: ConnectedServer,
      kind: ServerSession['kind'],
      username: string,
      password: string,
    ) => {
      let session: ServerSession;
      if (kind === 'overlay') {
        const result = await OverlayServer.login(
          server.baseUrl,
          username,
          password,
        );
        session = {
          kind,
          username,
          token: result.token,
          expiresAt: result.expiresAt,
          refreshToken: result.refreshToken ?? undefined,
        };
      } else {
        const result = await UnitServer.login(
          server.baseUrl,
          username,
          password,
        );
        session = {
          kind,
          username: result.username,
          token: result.token,
          expiresAt: result.expiresAt,
        };
      }
      setSessions(updateStoredSession(server.id, session));
    },
    [],
  );

  const logout = useCallback(async (server: ConnectedServer) => {
    const session = loadServerSessions()[server.id];
    setSessions(updateStoredSession(server.id, null));
    if (session?.kind === 'unit') {
      try {
        await UnitServer.logout(server.baseUrl, session.token);
      } catch (err) {
        // The session is forgotten here either way and ends on its own.
        console.warn(`Signing out of ${server.baseUrl} failed`, err);
      }
    }
  }, []);

  const value = useMemo(
    () => ({ sessions, tokens, login, logout }),
    [sessions, tokens, login, logout],
  );

  return (
    <ServerAuthContext.Provider value={value}>
      {children}
    </ServerAuthContext.Provider>
  );
}

export function useServerAuth(): ServerAuthContextValue {
  const context = useContext(ServerAuthContext);
  if (!context) {
    throw new Error('useServerAuth must be used within a ServerAuthProvider');
  }
  return context;
}
