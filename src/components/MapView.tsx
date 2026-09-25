import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { MapRef, ViewStateChangeEvent } from '@vis.gl/react-maplibre';
import {
  GeolocateControl,
  Map,
  NavigationControl,
} from '@vis.gl/react-maplibre';
import type { RequestParameters, ResourceType } from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Alert from '@mui/material/Alert';
import { SearchButtonControl } from './mapControls/SearchButtonControl';
import { SettingsButtonControl } from './mapControls/SettingsButtonControl';

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

  const handleLocateMarker = (_uuid: string) => {
    /*
    const entry = allGeoObjects.find(
      (candidate: GeoObject) => candidate.geoObject.uuid === uuid,
    );
    const map = mapRef.current;
    if (!entry || !map) {
      return;
    }
    map.flyTo({
      center: [entry.geoObject.longitude, entry.geoObject.latitude],
      zoom: Math.max(map.getZoom(), 14),
    });*/
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
          const authorizationHeader = 'tss'; //TODO: replace
          if (!authorizationHeader) {
            return undefined;
          }
          return { url, headers: { Authorization: authorizationHeader } };
        }}
        onClick={() => void 0}
        onMoveEnd={handleMoveEnd}
      >
        <NavigationControl position="top-left" />
        <SearchButtonControl items={[]} onSelect={handleLocateMarker} />
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
        {/*enabledOverlaysTopFirst.map((overlay) => (
          <Source
            key={overlay.id}
            id={`${'OVERLAY_SOURCE_PREFIX'}${overlay.id}`}
            type="raster"
            tiles={overlay.tiles}
            tileSize={256}
          >
            <Layer
              id={`${'OVERLAY_LAYER_PREFIX'}${overlay.id}`}
              type="raster"
              paint={{
                'raster-opacity': overlay.opacity ?? 0.8,
              }}
            />
          </Source>
        ))*/}
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
