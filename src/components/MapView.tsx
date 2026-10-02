import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import './MapView.scss';
import Alert from '@mui/material/Alert';
import { FullscreenButtonControl } from './mapControls/FullscreenButtonControl';
import { SearchButtonControl } from './mapControls/SearchButtonControl';
import { SearchDialog } from './SearchDialog';
import { SettingsButtonControl } from './mapControls/SettingsButtonControl';
import { UnitMarkers } from './UnitMarkers';
import { useServerAuth } from '../context/ServerAuthContext';
import { useConnectedServers } from '../context/ConnectedServersContext';
import { type EnabledOverlay, useOverlays } from '../context/OverlaysContext';
import { loadAppConfig } from '../lib/config';

import {
  applyConfig,
  loadMapPosition,
  loadStyleUrl,
  saveCustomStyleUrl,
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

// Ids of the map layers drawing an overlay's GeoJSON layer's polygons,
// lines and points. Layer names can't contain "/", so they never collide.
const geoJsonLayerIds = (overlayId: string, name: string) => ({
  fill: `overlay-layer-${overlayId}-geojson-${name}-fill`,
  line: `overlay-layer-${overlayId}-geojson-${name}-line`,
  circle: `overlay-layer-${overlayId}-geojson-${name}-circle`,
});

// Changes whenever an overlay's tile bounds do.
function rasterSourceKey(overlay: EnabledOverlay): string {
  const { bounds } = overlay;
  return bounds
    ? [
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
        bounds.minZoom,
        bounds.maxZoom,
      ].join(',')
    : 'unbounded';
}

// An overlay's map layers, bottom first: its tiles, then its GeoJSON layers.
function overlayLayerIds(overlay: EnabledOverlay): string[] {
  return [
    `overlay-layer-${overlay.id}`,
    ...overlay.layers.flatMap(({ name }) => {
      const ids = geoJsonLayerIds(overlay.id, name);
      return [ids.fill, ids.line, ids.circle];
    }),
  ];
}

export function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const { tokens } = useServerAuth();
  const { overlayServers } = useConnectedServers();
  const { enabledOverlays } = useOverlays();

  // transformRequest is only read when the map is created, so it looks the
  // token and servers up through a ref to always see the current values.
  const authRef = useRef({ tokens, overlayServers });
  useEffect(() => {
    authRef.current = { tokens, overlayServers };
  }, [tokens, overlayServers]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Once true, stays true - lets the (lazy-loaded) dialog stay mounted
  // across close/reopen so its close transition still animates, while still
  // deferring the initial chunk load until first opened.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [initialPosition] = useState(
    () => loadMapPosition() ?? DEFAULT_MAP_POSITION,
  );
  const [mapActionError, setMapActionError] = useState<string | null>(null);
  const [focusPosition, setFocusPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    loadAppConfig()
      .then(applyConfig)
      .catch((error) => {
        console.log('Failed to load config.json:', error);
      });
  }, []);

  // Layers are only stacked in render order when first added, so move them
  // to the top one by one, bottom first, whenever the order changes. Each
  // overlay's GeoJSON layers sit right above its tiles.
  // Layers re-added later, like a raster layer whose source was remounted,
  // are moved back into place on the next style update.
  const overlayOrder = enabledOverlays.flatMap(overlayLayerIds).join('\n');
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !overlayOrder) {
      return;
    }
    const wanted = overlayOrder.split('\n');
    const reorder = () => {
      const present = wanted.filter((layerId) => map.getLayer(layerId));
      const top = map.getLayersOrder().slice(-present.length);
      if (present.every((layerId, index) => top[index] === layerId)) {
        return;
      }
      for (const layerId of present) {
        map.moveLayer(layerId);
      }
    };
    reorder();
    map.on('styledata', reorder);
    return () => {
      map.off('styledata', reorder);
    };
  }, [overlayOrder]);

  const handleApplyStyle = (url: string) => {
    saveCustomStyleUrl(url);
    const nextStyleUrl = loadStyleUrl(DEFAULT_STYLE_URL);
    setStyleUrl(nextStyleUrl);
    return nextStyleUrl;
  };

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
          const { tokens, overlayServers } = authRef.current;
          const server = overlayServers.find((candidate) =>
            url.startsWith(candidate.baseUrl),
          );
          const accessToken = server ? tokens[server.id] : null;
          if (!accessToken) {
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
        <SearchButtonControl onOpen={() => setSearchOpen(true)} />
        <GeolocateControl
          position="top-left"
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation
        />
        <FullscreenButtonControl />
        <SettingsButtonControl
          onOpen={() => {
            setSettingsLoaded(true);
            setSettingsOpen(true);
          }}
        />
        {enabledOverlays.map((overlay) => (
          <Fragment key={overlay.id}>
            {/* Keyed by the bounds, which can't be changed in place. */}
            <Source
              key={rasterSourceKey(overlay)}
              id={`overlay-source-${overlay.id}`}
              type="raster"
              tiles={overlay.tiles}
              tileSize={256}
              {...(overlay.bounds && {
                bounds: [
                  overlay.bounds.west,
                  overlay.bounds.south,
                  overlay.bounds.east,
                  overlay.bounds.north,
                ],
                minzoom: overlay.bounds.minZoom,
                maxzoom: overlay.bounds.maxZoom,
              })}
            >
              <Layer
                id={`overlay-layer-${overlay.id}`}
                type="raster"
                paint={{
                  'raster-opacity': overlay.opacity,
                }}
              />
            </Source>
            {/* Styled like tileserve-go's own map preview. */}
            {overlay.layers.map((layer) => {
              const ids = geoJsonLayerIds(overlay.id, layer.name);
              return (
                <Source
                  key={layer.name}
                  id={`overlay-geojson-${overlay.id}-${layer.name}`}
                  type="geojson"
                  data={layer.data}
                >
                  <Layer
                    id={ids.fill}
                    type="fill"
                    filter={['==', '$type', 'Polygon']}
                    paint={{ 'fill-color': layer.color, 'fill-opacity': 0.25 }}
                  />
                  {/* Also outlines the polygons. */}
                  <Layer
                    id={ids.line}
                    type="line"
                    filter={['!=', '$type', 'Point']}
                    paint={{ 'line-color': layer.color, 'line-width': 2 }}
                  />
                  <Layer
                    id={ids.circle}
                    type="circle"
                    filter={['==', '$type', 'Point']}
                    paint={{
                      'circle-color': layer.color,
                      'circle-radius': 5,
                      'circle-stroke-color': '#ffffff',
                      'circle-stroke-width': 1.5,
                    }}
                  />
                </Source>
              );
            })}
          </Fragment>
        ))}
        <UnitMarkers />
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
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleLocateMarker}
      />
      {settingsLoaded ? (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            styleUrl={styleUrl}
            onApplyStyle={handleApplyStyle}
          />
        </Suspense>
      ) : null}
    </>
  );
}
