// Client for a go-unit-mangement server, which tracks units and their
// positions. Endpoints follow its api/openapi.yaml. The server has to list
// this app's origin in CORS_ALLOWED_ORIGINS and accept the OIDC access token
// (OIDC_ACCESS_TOKEN_AUDIENCE / OIDC_ACCESS_TOKEN_ISSUERS).
import type { TaktischesZeichen } from '@taktische-zeichen/core';

export interface UnitUserRef {
  id: number;
  username: string;
}

// The `Position` schema; all values in WGS 84 degrees / meters.
export interface UnitPosition {
  lat: number;
  lon: number;
  height: number | null;
  // Horizontal accuracy radius in meters.
  accuracy: number | null;
  // Speed over ground in meters per second.
  speed: number | null;
  // Course over ground in degrees clockwise from true north.
  course: number | null;
  timestamp: string | null;
}

// A tactical symbol (DV 102), as component IDs of @taktische-zeichen/core.
export type UnitSymbol = Pick<
  TaktischesZeichen,
  | 'grundzeichen'
  | 'organisation'
  | 'fachaufgabe'
  | 'einheit'
  | 'verwaltungsstufe'
  | 'funktion'
  | 'symbol'
>;

// A radio call sign split into its parts, e.g. "Rotkreuz Musterstadt 12/83-1".
export interface UnitTacticalName {
  organisation?: string;
  regionalAssociation?: string;
  localAssociation?: string;
  function?: string;
  number?: string;
}

export interface Unit {
  id: string;
  name: string;
  position: UnitPosition | null;
  symbol: UnitSymbol | null;
  tacticalName: UnitTacticalName | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UnitUserRef | null;
  updatedBy: UnitUserRef | null;
}

// A message on the unit event stream (the `UnitEvent` schema).
export type UnitEvent =
  | { type: 'created' | 'updated'; id: string; unit: Unit }
  | { type: 'deleted'; id: string };

export class UnitServerError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UnitServerError';
    this.status = status;
  }
}

// Resolves the bearer token to send, or null when signed out.
export type TokenProvider = () => string | null | Promise<string | null>;

// The `LoginResponse` schema, reduced to what the app keeps.
export interface UnitServerSession {
  token: string;
  // Milliseconds since the epoch.
  expiresAt: number | null;
  username: string;
}

// WebSocket close codes the server ends the event stream with.
export const UNIT_EVENTS_SESSION_ENDED = 1008;

export class UnitServer {
  readonly baseUrl: string;
  private readonly getToken: TokenProvider;

  constructor(baseUrl: string, getToken: TokenProvider = () => null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.getToken = getToken;
  }

  // Signs in with an account of the server (POST /api/auth/login).
  static async login(
    baseUrl: string,
    username: string,
    password: string,
  ): Promise<UnitServerSession> {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      },
    );
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    const body = (await response.json()) as {
      token: string;
      expiresAt?: string;
      user?: { username?: string };
    };
    const expiresAt = body.expiresAt ? Date.parse(body.expiresAt) : NaN;
    return {
      token: body.token,
      expiresAt: Number.isNaN(expiresAt) ? null : expiresAt,
      username: body.user?.username ?? username,
    };
  }

  // Ends the session of the token (POST /api/auth/logout). Always succeeds
  // on the server, so only network errors reject.
  static async logout(baseUrl: string, token: string): Promise<void> {
    await fetch(`${baseUrl.replace(/\/+$/, '')}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Lists every unit, sorted by name.
  async listUnits(signal?: AbortSignal): Promise<Unit[]> {
    return this.request<Unit[]>('/api/units', signal);
  }

  // Opens the unit event stream. The server doesn't replay changes made
  // while disconnected, so refetch the list after (re)connecting. Resolves
  // to null when there is no token to authenticate with.
  async openEvents(): Promise<WebSocket | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }
    const url = new URL(`${this.baseUrl}/api/units/events`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    // Browsers can't set headers on a WebSocket, so the token goes in the
    // subprotocols "bearer, <token>".
    return new WebSocket(url, ['bearer', token]);
  }

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal,
    });
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    return (await response.json()) as T;
  }
}

async function errorFromResponse(response: Response): Promise<UnitServerError> {
  // Errors come back as {"error": "..."}.
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) {
      message = body.error;
    }
  } catch {
    // Not JSON, e.g. from a proxy in front of the server.
  }
  return new UnitServerError(message, response.status);
}
