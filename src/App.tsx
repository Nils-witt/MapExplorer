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
import { SettingsDialog } from './SettingsDialog';
import {
  AddMarkerButtonControl,
  MarkersListButtonControl,
  SettingsButtonControl,
} from './MapControls';
import { MarkersDialog } from './MarkersDialog';
import { OverlaysProvider, useOverlays } from './OverlaysContext';
import { MarkersProvider, useMarkers } from './MarkersContext';
import { ServersProvider, useServers } from './ServersContext';
import {
  DEFAULT_OVERLAY_OPACITY,
  OVERLAY_LAYER_PREFIX,
  OVERLAY_SOURCE_PREFIX,
  findAuthorizationHeader,
} from './overlayMap';
import {
  applyConfig,
  loadMapPosition,
  loadShowMarkerLabels,
  loadStyleUrl,
  saveMapPosition,
  saveShowMarkerLabels,
  saveStyleUrl,
} from './storage';
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
  const { markers, addMarker, removeAllMarkers, moveMarker } = useMarkers();
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

  const handleMapClick = (event: MapLayerMouseEvent) => {
    if (!addingMarker) {
      return;
    }
    const { lng, lat } = event.lngLat;
    addMarker(lng, lat);
    setAddingMarker(false);
  };

  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = event.viewState;
    saveMapPosition({ center: [longitude, latitude], zoom, bearing, pitch });
  };

  const handleRemoveAllMarkers = () => {
    removeAllMarkers();
    setSelectedMarkerId(null);
  };

  const handleLocateMarker = (id: string) => {
    const marker = markers.find((candidate) => candidate.id === id);
    setSelectedMarkerId(id);
    const map = mapRef.current;
    if (!marker || !map) {
      return;
    }
    map.flyTo({
      center: [marker.lng, marker.lat],
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
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            longitude={marker.lng}
            latitude={marker.lat}
            draggable
            onDragEnd={(event: MarkerDragEvent) =>
              moveMarker(marker.id, event.lngLat.lng, event.lngLat.lat)
            }
          >
            <PlaceIcon
              color={selectedMarkerId === marker.id ? 'error' : 'primary'}
              fontSize="large"
            />
          </Marker>
        ))}
        {showMarkerLabels
          ? markers.map((marker) => (
              <Popup
                key={marker.id}
                longitude={marker.lng}
                latitude={marker.lat}
                closeButton={false}
                closeOnClick={false}
                anchor="top"
                offset={16}
                className="marker-label-popup"
              >
                {marker.name}
              </Popup>
            ))
          : null}
      </Map>
      {addingMarker ? (
        <div className="marker-hint">Click the map to place a marker</div>
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
        onRemoveAll={handleRemoveAllMarkers}
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
        <MarkersProvider>
          <MapView />
        </MarkersProvider>
      </OverlaysProvider>
    </ServersProvider>
  );
}
