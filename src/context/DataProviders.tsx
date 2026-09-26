import { Outlet } from 'react-router';
import { ConnectedServersProvider } from './ConnectedServersContext';
import { OverlaysProvider } from './OverlaysContext';

// Providers live in a layout route so server/overlay/marker state survives
// navigation between child routes.
export function DataProviders() {
  return (
    <ConnectedServersProvider>
      <OverlaysProvider>
        <Outlet />
      </OverlaysProvider>
    </ConnectedServersProvider>
  );
}
