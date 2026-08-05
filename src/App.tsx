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

const DEFAULT_OVERLAYS: Overlay[] = [
  {
    id: 'openrailwaymap',
    name: 'OpenRailwayMap',
    tiles: [
      'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
      'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
      'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    ],
    enabled: false,
  },
  {
    id: 'openseamap',
    name: 'OpenSeaMap',
    tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
    enabled: false,
  },
];

const OVERLAY_SOURCE_PREFIX = 'overlay-source-';
const OVERLAY_LAYER_PREFIX = 'overlay-layer-';

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
  const overlaysRef = useRef<Overlay[]>(DEFAULT_OVERLAYS);
  const isFirstStyleRender = useRef(true);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(DEFAULT_STYLE_URL);
  const [overlays, setOverlays] = useState<Overlay[]>(DEFAULT_OVERLAYS);

  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);

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
      />
    </>
  );
}
