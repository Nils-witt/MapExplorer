import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef, ViewStateChangeEvent } from '@vis.gl/react-maplibre';
import {
  GeolocateControl,
  Layer,
  Map,
  NavigationControl,
  Source,
} from '@vis.gl/react-maplibre';
import type { RequestParameters, ResourceType } from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigate, Outlet, createBrowserRouter } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import {
  SearchButtonControl,
  SettingsButtonControl,
} from './components/MapControls';
import { OverlaysProvider, useOverlays } from './context/OverlaysContext';
import { GeoObjectsProvider, useGeoObjects } from './context/GeoObjectsContext';
import { ServersProvider, useServers } from './context/ServersContext';
import { useAuth } from './context/AuthContext';
import {
  DEFAULT_OVERLAY_OPACITY,
  OVERLAY_LAYER_PREFIX,
  OVERLAY_SOURCE_PREFIX,
  findAuthorizationHeader,
} from './lib/overlayMap';
import {
  applyConfig,
  loadMapPosition,
  loadStyleUrl,
  saveMapPosition,
  saveStyleUrl,
} from './lib/storage';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import LoginPage from './pages/LoginPage.tsx';
import LoginCallbackPage from './pages/LoginCallbackPage.tsx';

setWorkerUrl(workerUrl);

// Both dialogs are hidden behind an `open` flag until the user opens the
// settings menu or the markers list - loading their code (and, for
// MarkersDialog, the CSV import machinery it pulls in) eagerly would bloat
// the initial bundle for something most sessions never touch.
const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then((m) => ({
    default: m.SettingsDialog,
  })),
);

const DEFAULT_STYLE_URL =
  import.meta.env.VITE_DEFAULT_STYLE_URL ??
  'https://demotiles.maplibre.org/style.json';

const DEFAULT_MAP_POSITION = {
  center: [7.09, 50.73] as [number, number],
  zoom: 10,
  bearing: 0,
  pitch: 0,
};

function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const { overlays, overlaysRef } = useOverlays();
  const { allGeoObjects } = useGeoObjects();
  const { serversRef, authErrors, dismissAuthError } = useServers();

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Once true, stays true - lets the (lazy-loaded) dialog stay mounted
  // across close/reopen so its close transition still animates, while still
  // deferring the initial chunk load until first opened.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [initialPosition] = useState(
    () => loadMapPosition() ?? DEFAULT_MAP_POSITION,
  );
  const [mapActionError, setMapActionError] = useState<string | null>(null);

  useEffect(() => {
    try {
      fetch('/config.json')
        .then((response) => response.json())
        .then((config) => {
          applyConfig(config);
        })
        .catch((error) => {
          console.log('Failed to load config.json:', error);
        });
    } catch (error) {
      console.log('Failed to load config.json:', error);
    }
  }, []);

  useEffect(() => {
    saveStyleUrl(styleUrl);
  }, [styleUrl]);

  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = event.viewState;
    saveMapPosition({ center: [longitude, latitude], zoom, bearing, pitch });
  };

  const searchableGeoObjects = useMemo(
    () =>
      allGeoObjects.map((entry) => {
        const sublabel = [
          entry.geoObject.street,
          entry.geoObject.housenumber,
          entry.geoObject.postcode,
        ]
          .filter(Boolean)
          .join(' ');
        const searchText = [
          entry.geoObject.name,
          entry.geoObject.street,
          entry.geoObject.housenumber,
          entry.geoObject.postcode,
          entry.geoObject.externalId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return {
          uuid: entry.geoObject.uuid,
          label: entry.geoObject.name,
          sublabel,
          searchText,
        };
      }),
    [allGeoObjects],
  );

  const enabledOverlaysTopFirst = useMemo(
    () => [...overlays].reverse().filter((overlay) => overlay.enabled),
    [overlays],
  );

  const handleLocateMarker = (uuid: string) => {
    const entry = allGeoObjects.find(
      (candidate) => candidate.geoObject.uuid === uuid,
    );
    const map = mapRef.current;
    if (!entry || !map) {
      return;
    }
    map.flyTo({
      center: [entry.geoObject.longitude, entry.geoObject.latitude],
      zoom: Math.max(map.getZoom(), 14),
    });
  };

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: initialPosition.center[0],
          latitude: initialPosition.center[1],
          zoom: initialPosition.zoom,
          bearing: initialPosition.bearing,
          pitch: initialPosition.pitch,
        }}
        mapStyle={styleUrl}
        style={{ position: 'absolute', inset: 0 }}
        transformRequest={(
          url: string,
          _resourceType?: ResourceType,
        ): RequestParameters | undefined => {
          const authorizationHeader = findAuthorizationHeader(
            url,
            overlaysRef.current,
            serversRef.current,
          );
          if (!authorizationHeader) {
            return undefined;
          }
          return { url, headers: { Authorization: authorizationHeader } };
        }}
        onClick={() => void 0}
        onMoveEnd={handleMoveEnd}
      >
        <NavigationControl position="top-left" />
        <SearchButtonControl
          items={searchableGeoObjects}
          onSelect={handleLocateMarker}
        />
        <GeolocateControl
          position="top-left"
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation
        />
        <SettingsButtonControl
          onOpen={() => {
            setSettingsLoaded(true);
            setSettingsOpen(true);
          }}
        />
        {enabledOverlaysTopFirst.map((overlay) => (
          <Source
            key={overlay.id}
            id={`${OVERLAY_SOURCE_PREFIX}${overlay.id}`}
            type="raster"
            tiles={overlay.tiles}
            tileSize={256}
          >
            <Layer
              id={`${OVERLAY_LAYER_PREFIX}${overlay.id}`}
              type="raster"
              paint={{
                'raster-opacity': overlay.opacity ?? DEFAULT_OVERLAY_OPACITY,
              }}
            />
          </Source>
        ))}
      </Map>
      {Object.keys(authErrors).length > 0 ? (
        <Stack
          spacing={1}
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            width: 'min(90vw, 420px)',
          }}
        >
          {Object.entries(authErrors).map(([serverId, message]) => (
            <Alert
              key={serverId}
              severity="error"
              onClose={() => dismissAuthError(serverId)}
            >
              {message}
            </Alert>
          ))}
        </Stack>
      ) : null}
      {mapActionError ? (
        <Alert
          severity="error"
          onClose={() => setMapActionError(null)}
          sx={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
          }}
        >
          {mapActionError}
        </Alert>
      ) : null}
      <div className="copyright">© 2026 Nils Witt</div>
      {settingsLoaded ? (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            styleUrl={styleUrl}
            onApplyStyle={setStyleUrl}
          />
        </Suspense>
      ) : null}
    </>
  );
}

// Sends signed-out users to the login page. Waits for the stored session to
// be read first, so a reload doesn't bounce a signed-in user to /login.
function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// Providers live in a layout route so server/overlay/marker state survives
// navigation between child routes.
function AppLayout() {
  return (
    <ServersProvider>
      <OverlaysProvider>
        <GeoObjectsProvider>
          <Outlet />
        </GeoObjectsProvider>
      </OverlaysProvider>
    </ServersProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: 'login',
    element: <LoginPage />,
  },
  {
    path: 'login/callback',
    element: <LoginCallbackPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '',
        element: <AppLayout />,
        children: [
          { index: true, element: <MapView /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
