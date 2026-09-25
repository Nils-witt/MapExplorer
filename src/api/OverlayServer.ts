// Client for a tileserve-go server, which serves the map tile overlays.
// Endpoints follow tileserve-go's internal/webserver/openapi.yaml.

// A map on the server (the `Map` schema); each one can be drawn as an
// overlay from its tiles at `/maps/{uuid}/version/{version}/{z}/{x}/{y}.png`.
export interface OverlayMap {
  uuid: string;
  name: string;
  // Empty if none was set.
  description: string;
  currentVersion: string;
  visibleToAll: boolean;
  // Whether the tiles can be fetched without a bearer token.
  anonymousAllowed: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  owner: string;
  // Only set for maps mirrored from another server, which are read-only.
  syncRemoteId?: string;
  syncRemoteName?: string;
}

// Query filters of `GET /maps`.
export interface ListOverlaysFilter {
  // Case-insensitive substring match on the map name.
  name?: string;
  // Exact match on the username that created the map.
  createdBy?: string;
  visibleToAll?: boolean;
  anonymousAllowed?: boolean;
}

export class OverlayServerError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OverlayServerError';
    this.status = status;
  }
}

// Resolves the bearer token to send, or null to call the server anonymously.
export type TokenProvider = () => string | null | Promise<string | null>;

export class OverlayServer {
  readonly baseUrl: string;
  private readonly getToken: TokenProvider;

  constructor(baseUrl: string, getToken: TokenProvider = () => null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.getToken = getToken;
  }

  // Lists the maps the signed-in user may see: those visible to all, their
  // own, ones shared with them, or all of them for admins.
  async listOverlays(
    filter: ListOverlaysFilter = {},
    signal?: AbortSignal,
  ): Promise<OverlayMap[]> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const search = query.toString();
    return this.request<OverlayMap[]>(
      search ? `/maps?${search}` : '/maps',
      signal,
    );
  }

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal,
    });
    if (!response.ok) {
      // Errors come back as a plain-text message.
      const message = await response.text();
      throw new OverlayServerError(
        message || `${response.status} ${response.statusText}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }
}
