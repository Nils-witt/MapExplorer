import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useConnectedServers } from './ConnectedServersContext.tsx';
import { type OverlayMap, OverlayServer } from '../api/OverlayServer.ts';
import { useAuth } from './AuthContext.tsx';
import {
  loadEnabledOverlayKeys,
  loadOverlayOpacities,
  saveEnabledOverlayKeys,
  saveOverlayOpacities,
} from '../lib/storage.ts';

export const DEFAULT_OVERLAY_OPACITY = 0.8;

// An enabled overlay resolved to what the map needs to draw it.
export interface EnabledOverlay {
  id: string;
  serverId: string;
  tiles: string[];
  opacity: number;
}

interface OverlaysContextValue {
  overlays: Record<string, OverlayMap[]>;
  enabledOverlayIds: string[];
  setOverlayEnabled: (overlayId: string, enabled: boolean) => void;
  getOverlayOpacity: (overlayId: string) => number;
  setOverlayOpacity: (overlayId: string, opacity: number) => void;
  // Enabled overlays in the order they were switched on, so the most
  // recently enabled one is drawn on top.
  enabledOverlays: EnabledOverlay[];
}

const OverlaysContext = createContext<OverlaysContextValue | null>(null);

export function OverlaysProvider({ children }: { children: ReactNode }) {
  const { overlayServers } = useConnectedServers();
  const { accessToken } = useAuth();

  const [overlays, setOverlays] = useState<Record<string, OverlayMap[]>>({});
  const [enabledOverlayIds, setEnabledOverlayIds] = useState<string[]>(
    loadEnabledOverlayKeys,
  );
  const [overlayOpacities, setOverlayOpacities] =
    useState<Record<string, number>>(loadOverlayOpacities);

  useEffect(() => {
    let cancelled = false;
    const fetchOverlays = async () => {
      const newOverlays: Record<string, OverlayMap[]> = {};
      for (const server of overlayServers) {
        const ovS = new OverlayServer(server.baseUrl, () => accessToken);
        try {
          const overlaysList = await ovS.listOverlays();
          newOverlays[server.id] = overlaysList;
        } catch (error) {
          console.error(
            `Error occurred while fetching overlays from server ${server.name}:`,
            error,
          );
          newOverlays[server.id] = [];
        }
      }
      if (!cancelled) {
        setOverlays(newOverlays);
      }
    };

    void fetchOverlays();

    return () => {
      cancelled = true;
    };
  }, [overlayServers, accessToken]);

  useEffect(() => {
    console.log('Overlays updated:', overlays);
  }, [overlays]);

  useEffect(() => {
    saveEnabledOverlayKeys(enabledOverlayIds);
  }, [enabledOverlayIds]);

  useEffect(() => {
    saveOverlayOpacities(overlayOpacities);
  }, [overlayOpacities]);

  const setOverlayEnabled = useCallback(
    (overlayId: string, enabled: boolean) => {
      setEnabledOverlayIds((prev) => {
        const without = prev.filter((id) => id !== overlayId);
        return enabled ? [...without, overlayId] : without;
      });
    },
    [],
  );

  const getOverlayOpacity = useCallback(
    (overlayId: string) =>
      overlayOpacities[overlayId] ?? DEFAULT_OVERLAY_OPACITY,
    [overlayOpacities],
  );

  const setOverlayOpacity = useCallback(
    (overlayId: string, opacity: number) => {
      setOverlayOpacities((prev) => ({ ...prev, [overlayId]: opacity }));
    },
    [],
  );

  const enabledOverlays = useMemo(() => {
    const result: EnabledOverlay[] = [];
    for (const overlayId of enabledOverlayIds) {
      for (const server of overlayServers) {
        const overlay = overlays[server.id]?.find((o) => o.uuid === overlayId);
        if (overlay) {
          const baseUrl = server.baseUrl.replace(/\/+$/, '');
          result.push({
            id: overlay.uuid,
            serverId: server.id,
            tiles: [
              `${baseUrl}/maps/${overlay.uuid}/version/${overlay.currentVersion}/{z}/{x}/{y}.png`,
            ],
            opacity: getOverlayOpacity(overlay.uuid),
          });
          break;
        }
      }
    }
    return result;
  }, [enabledOverlayIds, overlays, overlayServers, getOverlayOpacity]);

  const value = useMemo(
    () => ({
      overlays,
      enabledOverlayIds,
      setOverlayEnabled,
      getOverlayOpacity,
      setOverlayOpacity,
      enabledOverlays,
    }),
    [
      overlays,
      enabledOverlayIds,
      setOverlayEnabled,
      getOverlayOpacity,
      setOverlayOpacity,
      enabledOverlays,
    ],
  );

  return (
    <OverlaysContext.Provider value={value}>
      {children}
    </OverlaysContext.Provider>
  );
}

export function useOverlays(): OverlaysContextValue {
  const context = useContext(OverlaysContext);
  if (!context) {
    throw new Error('useOverlays must be used within an OverlaysProvider');
  }
  return context;
}
