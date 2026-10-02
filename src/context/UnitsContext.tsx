import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  type Unit,
  type UnitEvent,
  UNIT_EVENTS_SESSION_ENDED,
  UnitServer,
} from '../api/UnitServer';
import { type ConnectedServer, isServerEnabled } from '../types';
import { useConnectedServers } from './ConnectedServersContext';
import { useServerAuth } from './ServerAuthContext';

// How a unit server's live connection is doing.
export type UnitServerStatus =
  | { state: 'connecting' }
  | { state: 'live' }
  // Waiting to reconnect; `error` says why the last attempt ended.
  | { state: 'offline'; error: string }
  | { state: 'signedOut' }
  | { state: 'disabled' };

// A unit together with the server it came from.
export interface ServerUnit {
  serverId: string;
  unit: Unit;
}

interface UnitsContextValue {
  // Units by server id, each by unit id. Keeps the last known units while a
  // server is offline.
  units: Record<string, Record<string, Unit>>;
  // Every unit of every server, sorted by name.
  allUnits: ServerUnit[];
  status: Record<string, UnitServerStatus>;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

// Reconnect delays after the stream drops: doubling from the first to the
// last, and back to the first once a connection succeeds.
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function UnitsProvider({ children }: { children: ReactNode }) {
  const { unitServers } = useConnectedServers();
  const enabledServers = useMemo(
    () => unitServers.filter(isServerEnabled),
    [unitServers],
  );
  const { tokens } = useServerAuth();
  // Only servers there is a token for are followed. Keyed by their ids, so
  // a renewed token doesn't restart the streams.
  const signedInKey = enabledServers
    .filter((server) => tokens[server.id])
    .map((server) => server.id)
    .join('\n');
  const followedServers = useMemo(() => {
    const ids = new Set(signedInKey.split('\n'));
    return enabledServers.filter((server) => ids.has(server.id));
  }, [enabledServers, signedInKey]);

  const [units, setUnits] = useState<Record<string, Record<string, Unit>>>({});
  const [status, setStatus] = useState<Record<string, UnitServerStatus>>({});

  // Streams read the token through a ref: renewing it mustn't tear down
  // every connection, but a reconnect has to use the fresh one.
  const tokensRef = useRef(tokens);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  useEffect(() => {
    const stops = followedServers.map((server) =>
      followServer(
        server,
        () => tokensRef.current[server.id] ?? null,
        (update) =>
          setUnits((prev) => ({
            ...prev,
            [server.id]: update(prev[server.id] ?? {}),
          })),
        (serverStatus) =>
          setStatus((prev) => ({ ...prev, [server.id]: serverStatus })),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [followedServers]);

  // State can still hold removed or disabled servers, or units from before
  // signing out; only what's current is passed on.
  const value = useMemo<UnitsContextValue>(() => {
    const current: Record<string, Record<string, Unit>> = {};
    const currentStatus: Record<string, UnitServerStatus> = {};
    for (const server of unitServers) {
      if (!isServerEnabled(server)) {
        currentStatus[server.id] = { state: 'disabled' };
        continue;
      }
      if (!tokens[server.id]) {
        currentStatus[server.id] = { state: 'signedOut' };
        continue;
      }
      currentStatus[server.id] = status[server.id] ?? { state: 'connecting' };
      if (units[server.id]) {
        current[server.id] = units[server.id];
      }
    }
    const allUnits = Object.entries(current)
      .flatMap(([serverId, serverUnits]) =>
        Object.values(serverUnits).map((unit) => ({ serverId, unit })),
      )
      .sort((a, b) => a.unit.name.localeCompare(b.unit.name));
    return { units: current, allUnits, status: currentStatus };
  }, [unitServers, tokens, units, status]);

  return (
    <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>
  );
}

// Keeps one server's units up to date: opens the event stream, loads the
// full list once it's open (so no change in between is missed), then
// applies each event. Reconnects with backoff whenever the stream ends.
// Returns a function that stops it.
function followServer(
  server: ConnectedServer,
  getToken: () => string | null,
  updateUnits: (
    update: (prev: Record<string, Unit>) => Record<string, Unit>,
  ) => void,
  setStatus: (status: UnitServerStatus) => void,
): () => void {
  const client = new UnitServer(server.baseUrl, getToken);
  let stopped = false;
  let socket: WebSocket | null = null;
  // Set while waiting out the backoff before the next attempt.
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = RECONNECT_MIN_MS;
  let controller: AbortController | null = null;

  const scheduleReconnect = (error: string, delay = retryDelay) => {
    if (stopped) {
      return;
    }
    setStatus({ state: 'offline', error });
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void connect(), delay);
    retryDelay = Math.min(retryDelay * 2, RECONNECT_MAX_MS);
  };

  const connect = async () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (stopped) {
      return;
    }
    setStatus({ state: 'connecting' });
    let ws: WebSocket | null;
    try {
      ws = await client.openEvents();
    } catch (error) {
      // An invalid base URL; retrying won't help until it's edited.
      setStatus({ state: 'offline', error: String(error) });
      return;
    }
    if (stopped) {
      ws?.close();
      return;
    }
    if (!ws) {
      scheduleReconnect('No access token');
      return;
    }
    socket = ws;
    // Events that arrive while the list is still loading, applied on top.
    let pending: UnitEvent[] | null = [];

    ws.onmessage = (message) => {
      let event: UnitEvent;
      try {
        event = JSON.parse(String(message.data)) as UnitEvent;
      } catch {
        return;
      }
      if (pending) {
        pending.push(event);
      } else {
        updateUnits((prev) => applyEvent(prev, event));
      }
    };

    ws.onopen = async () => {
      const listController = new AbortController();
      controller = listController;
      try {
        const list = await client.listUnits(listController.signal);
        const queued = pending ?? [];
        pending = null;
        updateUnits(() =>
          queued.reduce(
            applyEvent,
            Object.fromEntries(list.map((unit) => [unit.id, unit])),
          ),
        );
        retryDelay = RECONNECT_MIN_MS;
        setStatus({ state: 'live' });
      } catch (error) {
        // Aborted when the stream closed or this stopped, which already
        // took care of reconnecting.
        if (!listController.signal.aborted) {
          // Reconnect from scratch rather than follow events on top of a
          // stale list.
          ws.onclose = null;
          ws.close();
          scheduleReconnect(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    };

    ws.onclose = (event) => {
      controller?.abort();
      if (event.code === UNIT_EVENTS_SESSION_ENDED) {
        // The token the stream was opened with expired; the renewed one is
        // likely already there.
        scheduleReconnect('Session ended', RECONNECT_MIN_MS);
        return;
      }
      scheduleReconnect(
        event.reason ||
          (event.code === 1006
            ? 'Connection failed'
            : `Closed (${event.code})`),
      );
    };
  };

  // Don't sit out the backoff once the device is back online.
  const onOnline = () => {
    if (retryTimer !== undefined) {
      retryDelay = RECONNECT_MIN_MS;
      void connect();
    }
  };
  window.addEventListener('online', onOnline);

  void connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    controller?.abort();
    window.removeEventListener('online', onOnline);
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  };
}

function applyEvent(
  units: Record<string, Unit>,
  event: UnitEvent,
): Record<string, Unit> {
  if (event.type === 'deleted') {
    const { [event.id]: _removed, ...rest } = units;
    return rest;
  }
  return { ...units, [event.id]: event.unit };
}

export function useUnits(): UnitsContextValue {
  const context = useContext(UnitsContext);
  if (!context) {
    throw new Error('useUnits must be used within a UnitsProvider');
  }
  return context;
}
