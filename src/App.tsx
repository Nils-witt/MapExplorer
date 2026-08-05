import { useEffect, useRef, useState } from 'react';
import type { RequestParameters, ResourceType } from 'maplibre-gl';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SettingsDialog } from './SettingsDialog';
import { SettingsControl } from './SettingsControl';
import type { Overlay } from './types';

const DEFAULT_STYLE_URL =
  import.meta.env.VITE_DEFAULT_STYLE_URL ??
  'https://demotiles.maplibre.org/style.json';

const STYLE_URL_STORAGE_KEY = 'mapexplorer.styleUrl';
const OVERLAYS_STORAGE_KEY = 'mapexplorer.overlays';

const OVERLAY_SOURCE_PREFIX = 'overlay-source-';
const OVERLAY_LAYER_PREFIX = 'overlay-layer-';

function loadStyleUrl(): string {
  try {
    return localStorage.getItem(STYLE_URL_STORAGE_KEY) ?? DEFAULT_STYLE_URL;
  } catch {
    return DEFAULT_STYLE_URL;
  }
}

function loadOverlays(): Overlay[] {
  try {
    const stored = localStorage.getItem(OVERLAYS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function applyOverlays(map: MapLibreMap, overlays: Overlay[]) {
  const style = map.getStyle();
  if (!style) {
    return;
  }

  const existingOverlayLayerIds = (style.layers ?? [])
    .map((layer) => layer.id)
    .filter((id) => id.startsWith(OVERLAY_LAYER_PREFIX));

  for (const layerId of existingOverlayLayerIds) {
    const overlayId = layerId.slice(OVERLAY_LAYER_PREFIX.length);
    const overlay = overlays.find((candidate) => candidate.id === overlayId);
    if (!overlay?.enabled) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      const sourceId = `${OVERLAY_SOURCE_PREFIX}${overlayId}`;
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }
  }

  for (const overlay of overlays) {
    if (!overlay.enabled) {
      continue;
    }

    const sourceId = `${OVERLAY_SOURCE_PREFIX}${overlay.id}`;
    const layerId = `${OVERLAY_LAYER_PREFIX}${overlay.id}`;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: overlay.tiles,
        tileSize: 256,
      });
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: { 'raster-opacity': 0.8 },
      });
    }
  }

  // Enforce stacking order: overlays earlier in the list are drawn on top.
  // Moving each layer to the top in reverse-list order leaves the first
  // overlay on top once every layer has been placed.
  for (const overlay of [...overlays].reverse()) {
    if (!overlay.enabled) {
      continue;
    }
    const layerId = `${OVERLAY_LAYER_PREFIX}${overlay.id}`;
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  }
}

function tileUrlPrefix(template: string): string {
  return template.split('{')[0];
}

function findAuthorizationHeader(
  url: string,
  overlays: Overlay[],
): string | undefined {
  const overlay = overlays.find(
    (candidate) =>
      candidate.enabled &&
      candidate.authorizationHeader &&
      candidate.tiles.some((tile) => url.startsWith(tileUrlPrefix(tile))),
  );
  return overlay?.authorizationHeader;
}

export function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const isFirstStyleRender = useRef(true);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(loadStyleUrl);
  const [overlays, setOverlays] = useState<Overlay[]>(loadOverlays);

  useEffect(() => {
    overlaysRef.current = overlays;
    try {
      localStorage.setItem(OVERLAYS_STORAGE_KEY, JSON.stringify(overlays));
    } catch {
      // localStorage unavailable (e.g. private browsing) - skip persistence
    }
  }, [overlays]);

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_URL_STORAGE_KEY, styleUrl);
    } catch {
      // localStorage unavailable (e.g. private browsing) - skip persistence
    }
  }, [styleUrl]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [7.09, 50.73],
      zoom: 10,
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
    map.on('style.load', () => applyOverlays(map, overlaysRef.current));

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
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

  return (
    <>
      <div ref={mapContainerRef} className="map" />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        styleUrl={styleUrl}
        onApplyStyle={setStyleUrl}
        overlays={overlays}
        onToggleOverlay={handleToggleOverlay}
        onAddOverlay={handleAddOverlay}
        onRemoveOverlay={handleRemoveOverlay}
        onEditOverlay={handleEditOverlay}
        onMoveOverlay={handleMoveOverlay}
      />
    </>
  );
}
