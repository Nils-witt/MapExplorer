import { useEffect, useRef, useState } from 'react';
import type { RequestParameters, ResourceType } from 'maplibre-gl';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SettingsDialog } from './SettingsDialog';
import { SettingsControl } from './SettingsControl';
import type { Overlay } from './types';
import { applyOverlays, findAuthorizationHeader } from './overlayMap';
import {
  loadOverlays,
  loadStyleUrl,
  saveOverlays,
  saveStyleUrl,
} from './storage';

const DEFAULT_STYLE_URL =
  import.meta.env.VITE_DEFAULT_STYLE_URL ??
  'https://demotiles.maplibre.org/style.json';

export function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const isFirstStyleRender = useRef(true);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [overlays, setOverlays] = useState<Overlay[]>(loadOverlays);

  useEffect(() => {
    overlaysRef.current = overlays;
    saveOverlays(overlays);
  }, [overlays]);

  useEffect(() => {
    saveStyleUrl(styleUrl);
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
        onChangeOverlayOpacity={handleChangeOverlayOpacity}
        onRemoveOverlay={handleRemoveOverlay}
        onEditOverlay={handleEditOverlay}
        onMoveOverlay={handleMoveOverlay}
      />
    </>
  );
}
