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
  // Every version the user may see, most recent first (see
  // `GET /maps/{id}/versions`).
  versions: OverlayMapVersion[];
}

// An uploaded version of a map (the `MapVersion` schema).
export interface OverlayMapVersion {
  version: string;
  createdAt: string;
  createdBy: string;
}

// A point of interest tied to a map version (the `GeoObject` schema).
export interface OverlayGeoObject {
  uuid: string;
  mapUuid: string;
  version: string;
  name: string;
  externalId: string;
  latitude: number;
  longitude: number;
  street: string;
  housenumber: string;
  postcode: string;
  city: string;
  cityDistrict: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  // Names of the geo object groups it belongs to, sorted.
  groups: string[];
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

// Query filters of `GET /maps/{id}/version/{version}/geo-objects`.
export interface ListGeoObjectsFilter {
  // Case-insensitive substring match on the name.
  name?: string;
  externalId?: string;
  // Case-insensitive substring match.
  street?: string;
  postcode?: string;
  // Case-insensitive substring match.
  city?: string;
  // Case-insensitive substring match.
  cityDistrict?: string;
  // Exact match on the username that created the geo object.
  createdBy?: string;
  // Bounding box; the server requires all four together.
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
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
  // own, ones shared with them, or all of them for admins. Each one comes
  // with the versions the user may see: all of them if they may view all
  // versions, otherwise only the current one.
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
    const maps = await this.request<Omit<OverlayMap, 'versions'>[]>(
      search ? `/maps?${search}` : '/maps',
      signal,
    );
    return Promise.all(
      maps.map(async (map) => ({
        ...map,
        versions: await this.listVersions(map.uuid, signal),
      })),
    );
  }

  // Lists a map's versions, most recent first.
  async listVersions(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<OverlayMapVersion[]> {
    return this.request<OverlayMapVersion[]>(
      `/maps/${encodeURIComponent(uuid)}/versions`,
      signal,
    );
  }

  // Lists a map version's geo objects. `version` may also be "current" or
  // one of the map's aliases.
  async listGeoObjects(
    mapUuid: string,
    version: string,
    filter: ListGeoObjectsFilter = {},
    signal?: AbortSignal,
  ): Promise<OverlayGeoObject[]> {
    const { bounds, ...fields } = filter;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...fields, ...bounds })) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const search = query.toString();
    const path = `/maps/${encodeURIComponent(mapUuid)}/version/${encodeURIComponent(version)}/geo-objects`;
    return this.request<OverlayGeoObject[]>(
      search ? `${path}?${search}` : path,
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
