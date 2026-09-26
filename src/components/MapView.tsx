import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  type MapRef,
  Marker,
  type ViewStateChangeEvent,
} from '@vis.gl/react-maplibre';
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
import Alert from '@mui/material/Alert';
import { SearchButtonControl } from './mapControls/SearchButtonControl';
import { SettingsButtonControl } from './mapControls/SettingsButtonControl';
import { useAuth } from '../context/AuthContext';
import { useConnectedServers } from '../context/ConnectedServersContext';
import { useOverlays } from '../context/OverlaysContext';

import {
  applyConfig,
  loadMapPosition,
  loadStyleUrl,
  saveMapPosition,
} from '../lib/storage';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

// Both dialogs are hidden behind an `open` flag until the user opens the
// settings menu or the markers list - loading their code (and, for
// MarkersDialog, the CSV import machinery it pulls in) eagerly would bloat
// the initial bundle for something most sessions never touch.
const SettingsDialog = lazy(() =>
  import('./SettingsDialog').then((m) => ({
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

export function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const { accessToken } = useAuth();
  const { overlayServers } = useConnectedServers();
  const { enabledOverlays } = useOverlays();

  // transformRequest is only read when the map is created, so it looks the
  // token and servers up through a ref to always see the current values.
  const authRef = useRef({ accessToken, overlayServers });
  useEffect(() => {
    authRef.current = { accessToken, overlayServers };
  }, [accessToken, overlayServers]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Once true, stays true - lets the (lazy-loaded) dialog stay mounted
  // across close/reopen so its close transition still animates, while still
  // deferring the initial chunk load until first opened.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [styleUrl] = useState(() => loadStyleUrl(DEFAULT_STYLE_URL));
  const [initialPosition] = useState(
    () => loadMapPosition() ?? DEFAULT_MAP_POSITION,
  );
  const [mapActionError, setMapActionError] = useState<string | null>(null);
  const [focusPosition, setFocusPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

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

  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = event.viewState;
    saveMapPosition({ center: [longitude, latitude], zoom, bearing, pitch });
  };

  const handleLocateMarker = (
    _uuid: string,
    latitude: number,
    longitude: number,
  ) => {
    const map = mapRef.current;
    if (isNaN(latitude) || isNaN(longitude) || !map) {
      setFocusPosition(null);
      return;
    }
    setFocusPosition({ latitude, longitude });
    map.flyTo({
      center: [longitude, latitude],
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
          const { accessToken, overlayServers } = authRef.current;
          const isOverlayServerUrl = overlayServers.some((server) =>
            url.startsWith(server.baseUrl),
          );
          if (!accessToken || !isOverlayServerUrl) {
            return undefined;
          }
          return { url, headers: { Authorization: `Bearer ${accessToken}` } };
        }}
        onClick={() => void 0}
        onMoveEnd={handleMoveEnd}
      >
        {focusPosition && (
          <Marker
            latitude={focusPosition.latitude}
            longitude={focusPosition.longitude}
          />
        )}
        <NavigationControl position="top-left" />
        <SearchButtonControl onSelect={handleLocateMarker} />
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
        {enabledOverlays.map((overlay) => (
          <Source
            key={overlay.id}
            id={`overlay-source-${overlay.id}`}
            type="raster"
            tiles={overlay.tiles}
            tileSize={256}
          >
            <Layer
              id={`overlay-layer-${overlay.id}`}
              type="raster"
              paint={{
                'raster-opacity': overlay.opacity,
              }}
            />
          </Source>
        ))}
      </Map>

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
          />
        </Suspense>
      ) : null}
    </>
  );
}
