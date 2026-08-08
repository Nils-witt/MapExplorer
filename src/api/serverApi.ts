export const DEFAULT_SERVER_BASE_URL = 'https://overlays.example.com';

export interface ServerMap {
  uuid: string;
  name: string;
  currentVersion: string;
  visibleToAll: boolean;
  anonymousAllowed: boolean;
}

export class ServerApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `${response.status} ${response.statusText}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function login(
  baseUrl: string,
  username: string,
  password: string,
): Promise<AuthTokens> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
  const data = (await response.json()) as {
    token: string;
    refresh_token: string;
  };
  return { token: data.token, refreshToken: data.refresh_token };
}

export async function refreshAccessToken(
  baseUrl: string,
  refreshToken: string,
): Promise<AuthTokens> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
  const data = (await response.json()) as {
    token: string;
    refresh_token: string;
  };
  return { token: data.token, refreshToken: data.refresh_token };
}

export async function listMaps(
  baseUrl: string,
  token: string,
): Promise<ServerMap[]> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/maps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as ServerMap[];
}

export function tileUrlForMap(baseUrl: string, map: ServerMap): string {
  return `${normalizeBaseUrl(baseUrl)}/maps/${map.uuid}/version/${map.currentVersion}/{z}/{x}/{y}.png`;
}

export function overlayIdForMap(map: ServerMap): string {
  return `server-${map.uuid}`;
}

export interface GeoObject {
  uuid: string;
  mapUuid: string;
  version: string;
  name: string;
  latitude: number;
  longitude: number;
  externalId?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface GeoObjectRequest {
  name: string;
  latitude: number;
  longitude: number;
  externalId?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
}

function geoObjectsUrl(
  baseUrl: string,
  mapId: string,
  version: string,
  geoObjectId?: string,
): string {
  const base = `${normalizeBaseUrl(baseUrl)}/maps/${mapId}/version/${version}/geo-objects`;
  return geoObjectId ? `${base}/${geoObjectId}` : base;
}

export async function listGeoObjects(
  baseUrl: string,
  mapId: string,
  version: string,
  token: string,
): Promise<GeoObject[]> {
  const response = await fetch(geoObjectsUrl(baseUrl, mapId, version), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as GeoObject[];
}

export async function createGeoObject(
  baseUrl: string,
  mapId: string,
  version: string,
  token: string,
  body: GeoObjectRequest,
): Promise<GeoObject> {
  const response = await fetch(geoObjectsUrl(baseUrl, mapId, version), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as GeoObject;
}

export async function updateGeoObject(
  baseUrl: string,
  mapId: string,
  version: string,
  geoObjectId: string,
  token: string,
  body: GeoObjectRequest,
): Promise<GeoObject> {
  const response = await fetch(
    geoObjectsUrl(baseUrl, mapId, version, geoObjectId),
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as GeoObject;
}

export async function deleteGeoObject(
  baseUrl: string,
  mapId: string,
  version: string,
  geoObjectId: string,
  token: string,
): Promise<void> {
  const response = await fetch(
    geoObjectsUrl(baseUrl, mapId, version, geoObjectId),
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response), response.status);
  }
}
