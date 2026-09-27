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
  // Overlay server (tileserve-go) and unit server (go-unit-mangement) every
  // user is connected to; the names default to the host.
  defaultOverlaysServer?: string;
  defaultOverlaysServerName?: string;
  defaultUnitsServer?: string;
  defaultUnitsServerName?: string;
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

// Fixed ids, so the configured servers are recognized in the stored lists.
export const CONFIGURED_OVERLAY_SERVER_ID = 'configured-overlay-server';
export const CONFIGURED_UNIT_SERVER_ID = 'configured-unit-server';

export interface ConfiguredServers {
  // Null when none is configured.
  overlayServer: ConnectedServer | null;
  unitServer: ConnectedServer | null;
}

// The servers set by the deployment: in dev mode from VITE_OVERLAY_SERVER_URL
// / VITE_UNIT_SERVER_URL (see .env.example), otherwise from config.json.
// Rejects when config.json can't be loaded.
export async function loadConfiguredServers(): Promise<ConfiguredServers> {
  if (import.meta.env.DEV) {
    const env = import.meta.env;
    return {
      overlayServer: configuredServer(
        CONFIGURED_OVERLAY_SERVER_ID,
        env.VITE_OVERLAY_SERVER_URL,
        env.VITE_OVERLAY_SERVER_NAME,
      ),
      unitServer: configuredServer(
        CONFIGURED_UNIT_SERVER_ID,
        env.VITE_UNIT_SERVER_URL,
        env.VITE_UNIT_SERVER_NAME,
      ),
    };
  }
  const config = await loadAppConfig();
  return {
    overlayServer: configuredServer(
      CONFIGURED_OVERLAY_SERVER_ID,
      config.defaultOverlaysServer,
      config.defaultOverlaysServerName,
    ),
    unitServer: configuredServer(
      CONFIGURED_UNIT_SERVER_ID,
      config.defaultUnitsServer,
      config.defaultUnitsServerName,
    ),
  };
}

function configuredServer(
  id: string,
  baseUrl: string | undefined,
  name: string | undefined,
): ConnectedServer | null {
  if (!baseUrl) {
    return null;
  }
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    console.error(`Ignoring invalid server URL ${baseUrl} in the config`);
    return null;
  }
  return { id, baseUrl: baseUrl.replace(/\/+$/, ''), name: name || host };
}
