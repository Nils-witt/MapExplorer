import type { ConnectedServer } from '../types';

// A basemap the deployment offers; the name defaults to the host.
export interface MapStyle {
  name?: string;
  url: string;
}

// The deployment's /config.json (see config.example.json). The service
// worker keeps the last copy, so it also loads offline.
export interface AppConfig {
  // The basemaps users can pick from; the first one is the default.
  mapStyles?: MapStyle[];
  oidcIssuer?: string;
  oidcClientId?: string;
  // Overlay servers (tileserve-go) and unit servers (go-unit-mangement)
  // every user is connected to.
  overlayServers?: ServerConfig[];
  unitServers?: ServerConfig[];
}

// A server the deployment connects to; the name defaults to the host.
export interface ServerConfig {
  name?: string;
  url: string;
}

let configPromise: Promise<AppConfig> | null = null;

// Fetched once and shared by every caller.
export function loadAppConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = fetch('/config.json').then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load config.json (${response.status})`);
      }
      return (await response.json()) as AppConfig;
    });
    // Let a later call retry, e.g. once back online.
    configPromise.catch(() => {
      configPromise = null;
    });
  }
  return configPromise;
}

// Configured servers get ids from these prefixes and their url, so they're
// recognized in the stored lists. Before config.json could list several, the
// one configured server had the bare prefix as its id.
export const CONFIGURED_OVERLAY_SERVER_ID = 'configured-overlay-server';
export const CONFIGURED_UNIT_SERVER_ID = 'configured-unit-server';

export function isConfiguredServerId(id: string, prefix: string): boolean {
  return id === prefix || id.startsWith(`${prefix}:`);
}

export interface ConfiguredServers {
  overlayServers: ConnectedServer[];
  unitServers: ConnectedServer[];
}

// The servers set by the deployment: in dev mode from VITE_OVERLAY_SERVER_URL
// / VITE_UNIT_SERVER_URL (see .env.example), otherwise from config.json.
// Rejects when config.json can't be loaded.
export async function loadConfiguredServers(): Promise<ConfiguredServers> {
  if (import.meta.env.DEV) {
    const env = import.meta.env;
    return {
      overlayServers: configuredServers(CONFIGURED_OVERLAY_SERVER_ID, [
        {
          url: env.VITE_OVERLAY_SERVER_URL,
          name: env.VITE_OVERLAY_SERVER_NAME,
        },
      ]),
      unitServers: configuredServers(CONFIGURED_UNIT_SERVER_ID, [
        { url: env.VITE_UNIT_SERVER_URL, name: env.VITE_UNIT_SERVER_NAME },
      ]),
    };
  }
  const config = await loadAppConfig();
  return {
    overlayServers: configuredServers(
      CONFIGURED_OVERLAY_SERVER_ID,
      config.overlayServers,
    ),
    unitServers: configuredServers(
      CONFIGURED_UNIT_SERVER_ID,
      config.unitServers,
    ),
  };
}

// Skips entries without a valid url, and repeats of one.
function configuredServers(
  prefix: string,
  entries: Partial<ServerConfig>[] | undefined,
): ConnectedServer[] {
  const servers: ConnectedServer[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.url) {
      continue;
    }
    let host: string;
    try {
      host = new URL(entry.url).host;
    } catch {
      console.error(`Ignoring invalid server URL ${entry.url} in the config`);
      continue;
    }
    const baseUrl = entry.url.replace(/\/+$/, '');
    if (servers.some((server) => server.baseUrl === baseUrl)) {
      continue;
    }
    servers.push({
      id: `${prefix}:${baseUrl}`,
      baseUrl,
      name: entry.name || host,
    });
  }
  return servers;
}
