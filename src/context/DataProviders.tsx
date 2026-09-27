import { Outlet } from 'react-router';
import { ConnectedServersProvider } from './ConnectedServersContext';
import { OverlaysProvider } from './OverlaysContext';
import { UnitsProvider } from './UnitsContext';

// Providers live in a layout route so server/overlay/unit state survives
// navigation between child routes.
export function DataProviders() {
  return (
    <ConnectedServersProvider>
      <OverlaysProvider>
        <UnitsProvider>
          <Outlet />
        </UnitsProvider>
      </OverlaysProvider>
    </ConnectedServersProvider>
  );
}
