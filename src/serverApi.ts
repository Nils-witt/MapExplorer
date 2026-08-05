export const DEFAULT_SERVER_BASE_URL = 'https://overlays.example.com';

export interface ServerMap {
  uuid: string;
  name: string;
  currentVersion: string;
  visibleToAll: boolean;
  anonymousAllowed: boolean;
}

export class ServerApiError extends Error {}

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
): Promise<string> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response));
  }
  const data = (await response.json()) as { token: string };
  return data.token;
}

export async function listMaps(
  baseUrl: string,
  token: string,
): Promise<ServerMap[]> {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/maps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ServerApiError(await readErrorMessage(response));
  }
  return (await response.json()) as ServerMap[];
}

export function tileUrlForMap(baseUrl: string, map: ServerMap): string {
  return `${normalizeBaseUrl(baseUrl)}/maps/${map.uuid}/version/${map.currentVersion}/{z}/{x}/{y}.png`;
}
