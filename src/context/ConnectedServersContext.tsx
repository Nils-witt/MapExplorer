import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type ConnectedServer = {
  id: string;
  baseUrl: string;
  name: string;
};

interface ConnectedServersContextValue {
  unitServers: ConnectedServer[];
  overlayServers: ConnectedServer[];
}

const ConnectedServersContext =
  createContext<ConnectedServersContextValue | null>(null);

export function ConnectedServersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overlayServers] = useState<ConnectedServer[]>([
    {
      id: 'default-overlay-server',
      baseUrl: 'https://overlays.nilswitt.dev',
      name: 'Default Overlay Server',
    },
  ]);
  const [unitServers] = useState<ConnectedServer[]>([]);

  const value = useMemo(
    () => ({
      overlayServers,
      unitServers,
    }),
    [overlayServers, unitServers],
  );

  return (
    <ConnectedServersContext.Provider value={value}>
      {children}
    </ConnectedServersContext.Provider>
  );
}

export function useConnectedServers(): ConnectedServersContextValue {
  const context = useContext(ConnectedServersContext);
  if (!context) {
    throw new Error(
      'useConnectedServers must be used within a ConnectedServersProvider',
    );
  }
  return context;
}
