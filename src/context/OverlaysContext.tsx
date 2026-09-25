import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useConnectedServers } from './ConnectedServersContext.tsx';
import { type OverlayMap, OverlayServer } from '../api/OverlayServer.ts';
import { useAuth } from './AuthContext.tsx';

interface OverlaysContextValue {
  overlays: Record<string, OverlayMap[]>;
}

const OverlaysContext = createContext<OverlaysContextValue | null>(null);

export function OverlaysProvider({ children }: { children: ReactNode }) {
  const { overlayServers } = useConnectedServers();
  const { accessToken } = useAuth();

  const [overlays, setOverlays] = useState<Record<string, OverlayMap[]>>({});

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

  const value = useMemo(
    () => ({
      overlays,
    }),
    [overlays],
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
