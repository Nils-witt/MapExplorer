import { useEffect, useRef, useState } from 'react';
import type {
  MapLayerMouseEvent,
  MapRef,
  MarkerDragEvent,
  ViewStateChangeEvent,
} from '@vis.gl/react-maplibre';
import {
  GeolocateControl,
  Layer,
  Map,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from '@vis.gl/react-maplibre';
import type { RequestParameters, ResourceType } from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Alert from '@mui/material/Alert';
import { SettingsDialog } from './components/SettingsDialog';
import {
  AddMarkerButtonControl,
  MarkersListButtonControl,
  SettingsButtonControl,
} from './components/MapControls';
import { MarkersDialog } from './components/MarkersDialog';
import { OverlaysProvider, useOverlays } from './context/OverlaysContext';
import {
  GeoObjectsProvider,
  describeGeoObjectError,
  toGeoObjectRequest,
  useGeoObjects,
} from './context/GeoObjectsContext';
import { ServersProvider, useServers } from './context/ServersContext';
import {
  DEFAULT_OVERLAY_OPACITY,
  OVERLAY_LAYER_PREFIX,
  OVERLAY_SOURCE_PREFIX,
  findAuthorizationHeader,
} from './lib/overlayMap';
import {
  applyConfig,
  loadMapPosition,
  loadShowMarkerLabels,
  loadStyleUrl,
  saveMapPosition,
  saveShowMarkerLabels,
  saveStyleUrl,
} from './lib/storage';
import PlaceIcon from '@mui/icons-material/Place';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

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
  const {
    allGeoObjects,
    activeOverlayId,
    isOnline,
    createGeoObject,
    updateGeoObject,
  } = useGeoObjects();
  const { serversRef } = useServers();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [markersDialogOpen, setMarkersDialogOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [addingMarker, setAddingMarker] = useState(false);
  const [initialPosition] = useState(
    () => loadMapPosition() ?? DEFAULT_MAP_POSITION,
  );
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showMarkerLabels, setShowMarkerLabels] = useState(() =>
    loadShowMarkerLabels(),
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

  useEffect(() => {
    saveShowMarkerLabels(showMarkerLabels);
  }, [showMarkerLabels]);

  const addMarkerDisabled = !activeOverlayId || !isOnline;
  const addMarkerDisabledReason = !isOnline
    ? "You're offline"
    : !activeOverlayId
      ? 'Connect to a server and select a map to add markers'
      : undefined;

  const handleMapClick = (event: MapLayerMouseEvent) => {
    if (!addingMarker) {
      return;
    }
    setAddingMarker(false);
    if (!activeOverlayId) {
      return;
    }
    const { lng, lat } = event.lngLat;
    createGeoObject(activeOverlayId, {
      name: 'New marker',
      latitude: lat,
      longitude: lng,
    }).catch((err) => {
      setMapActionError(describeGeoObjectError(err));
    });
  };

  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = event.viewState;
    saveMapPosition({ center: [longitude, latitude], zoom, bearing, pitch });
  };

  const handleLocateMarker = (uuid: string) => {
    const entry = allGeoObjects.find(
      (candidate) => candidate.geoObject.uuid === uuid,
    );
    setSelectedMarkerId(uuid);
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
        cursor={addingMarker ? 'crosshair' : undefined}
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
        onClick={handleMapClick}
        onMoveEnd={handleMoveEnd}
      >
        <NavigationControl position="top-left" />
        <AddMarkerButtonControl
          active={addingMarker}
          onToggle={() => setAddingMarker((prev) => !prev)}
          disabled={addMarkerDisabled}
          disabledReason={addMarkerDisabledReason}
        />
        <MarkersListButtonControl onOpen={() => setMarkersDialogOpen(true)} />
        <GeolocateControl
          position="top-left"
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation
        />
        <SettingsButtonControl onOpen={() => setSettingsOpen(true)} />
        {[...overlays]
          .reverse()
          .filter((overlay) => overlay.enabled)
          .map((overlay) => (
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
        {allGeoObjects.map((entry) => (
          <Marker
            key={entry.geoObject.uuid}
            longitude={entry.geoObject.longitude}
            latitude={entry.geoObject.latitude}
            draggable
            onDragEnd={(event: MarkerDragEvent) =>
              updateGeoObject(
                entry.overlayId,
                entry.geoObject.uuid,
                toGeoObjectRequest(entry, {
                  latitude: event.lngLat.lat,
                  longitude: event.lngLat.lng,
                }),
              ).catch((err) => {
                setMapActionError(describeGeoObjectError(err));
              })
            }
          >
            <PlaceIcon
              color={
                selectedMarkerId === entry.geoObject.uuid ? 'error' : 'primary'
              }
              fontSize="large"
            />
          </Marker>
        ))}
        {showMarkerLabels
          ? allGeoObjects.map((entry) => (
              <Popup
                key={entry.geoObject.uuid}
                longitude={entry.geoObject.longitude}
                latitude={entry.geoObject.latitude}
                closeButton={false}
                closeOnClick={false}
                anchor="top"
                offset={16}
                className="marker-label-popup"
              >
                {entry.geoObject.name}
              </Popup>
            ))
          : null}
      </Map>
      {addingMarker ? (
        <div className="marker-hint">Click the map to place a marker</div>
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
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        styleUrl={styleUrl}
        onApplyStyle={setStyleUrl}
      />
      <MarkersDialog
        open={markersDialogOpen}
        onClose={() => setMarkersDialogOpen(false)}
        onLocate={handleLocateMarker}
        showMarkerLabels={showMarkerLabels}
        onShowMarkerLabelsChange={setShowMarkerLabels}
      />
    </>
  );
}

export function App() {
  return (
    <ServersProvider>
      <OverlaysProvider>
        <GeoObjectsProvider>
          <MapView />
        </GeoObjectsProvider>
      </OverlaysProvider>
    </ServersProvider>
  );
}
