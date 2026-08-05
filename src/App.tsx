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
import type { LocalMarker, Overlay } from './types';
import {
  DEFAULT_OVERLAY_OPACITY,
  OVERLAY_LAYER_PREFIX,
  OVERLAY_SOURCE_PREFIX,
  findAuthorizationHeader,
} from './overlayMap';
import {
  applyConfig,
  loadMapPosition,
  loadMarkers,
  loadOverlays,
  loadStyleUrl,
  saveMapPosition,
  saveMarkers,
  saveOverlays,
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

export function App() {
  const mapRef = useRef<MapRef | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [markersDialogOpen, setMarkersDialogOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [overlays, setOverlays] = useState<Overlay[]>(loadOverlays);
  const [markers, setMarkers] = useState<LocalMarker[]>(loadMarkers);
  const [addingMarker, setAddingMarker] = useState(false);
  const [initialPosition] = useState(
    () => loadMapPosition() ?? DEFAULT_MAP_POSITION,
  );
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

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
    overlaysRef.current = overlays;
    saveOverlays(overlays);
  }, [overlays]);

  useEffect(() => {
    saveStyleUrl(styleUrl);
  }, [styleUrl]);

  useEffect(() => {
    saveMarkers(markers);
  }, [markers]);

  const handleMapClick = (event: MapLayerMouseEvent) => {
    if (!addingMarker) {
      return;
    }
    const { lng, lat } = event.lngLat;
    const id = `marker-${Date.now()}`;
    setMarkers((prev) => [...prev, { id, lng, lat, name: 'New marker' }]);
    setAddingMarker(false);
  };

  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = event.viewState;
    saveMapPosition({ center: [longitude, latitude], zoom, bearing, pitch });
  };

  const handleToggleOverlay = (id: string) => {
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id ? { ...overlay, enabled: !overlay.enabled } : overlay,
      ),
    );
  };

  const handleAddOverlay = (
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
  ) => {
    setOverlays((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name,
        tiles: [tilesUrl],
        enabled: true,
        authorizationHeader: authorizationHeader || undefined,
      },
    ]);
  };

  const handleChangeOverlayOpacity = (id: string, opacity: number) => {
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id ? { ...overlay, opacity } : overlay,
      ),
    );
  };

  const handleRemoveOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
  };

  const handleMoveOverlay = (id: string, direction: 'up' | 'down') => {
    setOverlays((prev) => {
      const index = prev.findIndex((overlay) => overlay.id === id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleEditOverlay = (
    id: string,
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
  ) => {
    const tiles = tilesUrl
      .split(',')
      .map((tile) => tile.trim())
      .filter(Boolean);
    setOverlays((prev) =>
      prev.map((overlay) =>
        overlay.id === id
          ? {
              ...overlay,
              name,
              tiles,
              authorizationHeader: authorizationHeader || undefined,
            }
          : overlay,
      ),
    );
  };

  const handleRenameMarker = (id: string, name: string) => {
    setMarkers((prev) =>
      prev.map((marker) => (marker.id === id ? { ...marker, name } : marker)),
    );
  };

  const handleRemoveMarker = (id: string) => {
    setMarkers((prev) => prev.filter((marker) => marker.id !== id));
  };

  const handleRemoveAllMarkers = () => {
    setMarkers([]);
    setSelectedMarkerId(null);
  };

  const handleImportMarkers = (imported: LocalMarker[]) => {
    setMarkers((prev) => [...prev, ...imported]);
  };

  const handleMoveMarker = (id: string, lng: number, lat: number) => {
    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === id ? { ...marker, lng, lat } : marker,
      ),
    );
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
              handleMoveMarker(marker.id, event.lngLat.lng, event.lngLat.lat)
            }
          >
            <PlaceIcon
              color={selectedMarkerId === marker.id ? 'error' : 'primary'}
              fontSize="large"
            />
          </Marker>
        ))}
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
        overlays={overlays}
        onToggleOverlay={handleToggleOverlay}
        onAddOverlay={handleAddOverlay}
        onChangeOverlayOpacity={handleChangeOverlayOpacity}
        onRemoveOverlay={handleRemoveOverlay}
        onEditOverlay={handleEditOverlay}
        onMoveOverlay={handleMoveOverlay}
      />
      <MarkersDialog
        open={markersDialogOpen}
        onClose={() => setMarkersDialogOpen(false)}
        markers={markers}
        onRename={handleRenameMarker}
        onRemove={handleRemoveMarker}
        onRemoveAll={handleRemoveAllMarkers}
        onLocate={handleLocateMarker}
        onImport={handleImportMarkers}
      />
    </>
  );
}
