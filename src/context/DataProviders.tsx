import { Outlet } from 'react-router';
import { ConnectedServersProvider } from './ConnectedServersContext';
import { DisplaySettingsProvider } from './DisplaySettingsContext';
import { OverlaysProvider } from './OverlaysContext';
import { ServerAuthProvider } from './ServerAuthContext';
import { UnitsProvider } from './UnitsContext';

// Providers live in a layout route so server/overlay/unit state survives
// navigation between child routes.
export function DataProviders() {
  return (
    <ConnectedServersProvider>
      <ServerAuthProvider>
        <OverlaysProvider>
          <UnitsProvider>
            <DisplaySettingsProvider>
              <Outlet />
            </DisplaySettingsProvider>
          </UnitsProvider>
        </OverlaysProvider>
      </ServerAuthProvider>
    </ConnectedServersProvider>
  );
}
