import { useEffect, useRef, useState } from 'react';
import type {
  Marker as MapLibreMarker,
  RequestParameters,
  ResourceType,
} from 'maplibre-gl';
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SettingsDialog } from './SettingsDialog';
import { SettingsControl } from './SettingsControl';
import { MarkerControl } from './MarkerControl';
import { MarkersListControl } from './MarkersListControl';
import { MarkersDialog } from './MarkersDialog';
import type { LocalMarker, Overlay } from './types';
import { applyOverlays, findAuthorizationHeader } from './overlayMap';
import { syncMarkers } from './markers';
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const isFirstStyleRender = useRef(true);
  const markerControlRef = useRef<MarkerControl | null>(null);
  const markerInstancesRef = useRef<Map<string, MapLibreMarker>>(new Map());
  const addingMarkerRef = useRef(false);
  const pendingFocusMarkerIdRef = useRef<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [markersDialogOpen, setMarkersDialogOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [overlays, setOverlays] = useState<Overlay[]>(loadOverlays);
  const [markers, setMarkers] = useState<LocalMarker[]>(loadMarkers);
  const [addingMarker, setAddingMarkerState] = useState(false);

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

  const setAddingMarker = (value: boolean) => {
    addingMarkerRef.current = value;
    setAddingMarkerState(value);
    markerControlRef.current?.setActive(value);
    const map = mapRef.current;
    if (map) {
      map.getCanvas().style.cursor = value ? 'crosshair' : '';
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const initialPosition = loadMapPosition() ?? DEFAULT_MAP_POSITION;
    const markerInstances = markerInstancesRef.current;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: styleUrl,
      center: initialPosition.center,
      zoom: initialPosition.zoom,
      bearing: initialPosition.bearing,
      pitch: initialPosition.pitch,
      transformRequest: (
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
      },
    });

    map.addControl(new NavigationControl(), 'top-left');
    map.addControl(
      new SettingsControl(() => setSettingsOpen(true)),
      'top-right',
    );
    const markerControl = new MarkerControl(() =>
      setAddingMarker(!addingMarkerRef.current),
    );
    markerControlRef.current = markerControl;
    map.addControl(markerControl, 'top-left');
    map.addControl(
      new MarkersListControl(() => setMarkersDialogOpen(true)),
      'top-left',
    );
    map.addControl(
      new GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
      'top-left',
    );
    map.on('style.load', () => applyOverlays(map, overlaysRef.current));
    map.on('moveend', () => {
      const center = map.getCenter();
      saveMapPosition({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    });
    map.on('click', (event) => {
      if (!addingMarkerRef.current) {
        return;
      }
      const { lng, lat } = event.lngLat;
      const id = `marker-${Date.now()}`;
      pendingFocusMarkerIdRef.current = id;
      setMarkers((prev) => [...prev, { id, lng, lat, name: 'New marker' }]);
      setAddingMarker(false);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerInstances.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFirstStyleRender.current) {
      isFirstStyleRender.current = false;
      return;
    }
    mapRef.current?.setStyle(styleUrl);
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      applyOverlays(map, overlays);
    }
  }, [overlays]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    syncMarkers(
      map,
      markers,
      markerInstancesRef.current,
      {
        onRename: handleRenameMarker,
        onRemove: handleRemoveMarker,
        onMove: handleMoveMarker,
      },
      pendingFocusMarkerIdRef.current,
    );
    pendingFocusMarkerIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

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

  const handleMoveMarker = (id: string, lng: number, lat: number) => {
    setMarkers((prev) =>
      prev.map((marker) =>
        marker.id === id ? { ...marker, lng, lat } : marker,
      ),
    );
  };

  const handleLocateMarker = (id: string) => {
    const marker = markers.find((candidate) => candidate.id === id);
    const map = mapRef.current;
    if (!marker || !map) {
      return;
    }
    map.flyTo({
      center: [marker.lng, marker.lat],
      zoom: Math.max(map.getZoom(), 14),
    });
    const instance = markerInstancesRef.current.get(id);
    if (instance && !instance.getPopup()?.isOpen()) {
      instance.togglePopup();
    }
  };

  return (
    <>
      <div ref={mapContainerRef} className="map" />
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
        onLocate={handleLocateMarker}
      />
    </>
  );
}
