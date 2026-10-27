import { useEffect, useMemo, useRef, useState } from 'react';
import { Popup, useMap } from '@vis.gl/react-maplibre';
import type { MapMouseEvent, PointLike } from 'maplibre-gl';
import type { Unit, UnitPosition } from '../api/UnitServer';
import { useDisplaySettings } from '../context/DisplaySettingsContext';
import { useUnits } from '../context/UnitsContext';
import { loadAppConfig } from '../lib/config';
import type { UnitModelLayer } from '../lib/UnitModelLayer';
import { symbolDataUrl } from '../lib/unitSymbol';
import { UnitDetails } from './UnitMarkers';

// Kept out of UnitModelLayer.ts so MapView can stack the layer without
// loading three.js.
export const UNIT_MODEL_LAYER_ID = 'unit-models';

interface PlacedUnit {
  key: string;
  unit: Unit;
  position: UnitPosition;
}

// Draws every unit with a position from the connected unit servers as a 3D
// model, with the same popup as UnitMarkers on click. three.js is only
// loaded once this is shown.
export function UnitModels() {
  const { current: mapRef } = useMap();
  const { allUnits } = useUnits();
  const { unitSymbolSize } = useDisplaySettings();
  const [layer, setLayer] = useState<UnitModelLayer | null>(null);
  // `${serverId}/${unitId}` of the unit whose popup is open.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const placed = useMemo(
    () =>
      allUnits.flatMap(({ serverId, unit }): PlacedUnit[] =>
        unit.position
          ? [{ key: `${serverId}/${unit.id}`, unit, position: unit.position }]
          : [],
      ),
    [allUnits],
  );

  // Symbols only change rarely, unlike positions, so they aren't rendered
  // again on every update.
  const symbolCache = useRef(new Map<string, string | null>());

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) {
      return;
    }
    let cancelled = false;
    let created: UnitModelLayer | null = null;
    // A style change drops the layer, so add it back once the new style
    // has loaded. MapView moves it to the top.
    const ensureLayer = () => {
      if (created && !map.getLayer(created.id)) {
        try {
          map.addLayer(created);
        } catch {
          // The style is still loading; the next styledata retries.
        }
      }
    };
    Promise.all([
      import('../lib/UnitModelLayer'),
      loadAppConfig().catch(() => null),
    ])
      .then(([{ UnitModelLayer }, config]) => {
        if (cancelled) {
          return;
        }
        created = new UnitModelLayer(
          UNIT_MODEL_LAYER_ID,
          config?.unitModelUrl || undefined,
        );
        ensureLayer();
        setLayer(created);
      })
      .catch((error) => {
        console.error('Failed to load the 3D unit layer:', error);
      });
    map.on('styledata', ensureLayer);
    return () => {
      cancelled = true;
      map.off('styledata', ensureLayer);
      if (created) {
        try {
          if (map.getLayer(created.id)) {
            map.removeLayer(created.id);
          }
        } catch {
          // The map is already gone.
        }
        created.dispose();
      }
    };
  }, [mapRef]);

  useEffect(() => {
    layer?.setMinSize(unitSymbolSize);
  }, [layer, unitSymbolSize]);

  useEffect(() => {
    layer?.setUnits(
      placed.map(({ key, unit, position }) => ({
        key,
        lat: position.lat,
        lon: position.lon,
        course: position.course,
        symbolUrl: cachedSymbolUrl(symbolCache.current, unit),
      })),
    );
  }, [layer, placed]);

  // The models aren't DOM elements, so clicks and hovers are matched to the
  // nearest unit on screen.
  const placedRef = useRef(placed);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) {
      return;
    }
    const unitAt = (point: PointLike): string | null => {
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
      let found: string | null = null;
      let nearest = unitSymbolSize / 2 + 8;
      for (const { key, position } of placedRef.current) {
        const projected = map.project([position.lon, position.lat]);
        const distance = Math.hypot(projected.x - x, projected.y - y);
        if (distance < nearest) {
          found = key;
          nearest = distance;
        }
      }
      return found;
    };
    const handleClick = (event: MapMouseEvent) => {
      const key = unitAt(event.point);
      if (key) {
        setOpenKey((prev) => (prev === key ? null : key));
      }
    };
    const handleMouseMove = (event: MapMouseEvent) => {
      map.getCanvas().style.cursor = unitAt(event.point) ? 'pointer' : '';
    };
    map.on('click', handleClick);
    map.on('mousemove', handleMouseMove);
    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.getCanvas().style.cursor = '';
    };
  }, [mapRef, unitSymbolSize]);

  const open = placed.find(({ key }) => key === openKey);
  if (!open) {
    return null;
  }
  return (
    <Popup
      latitude={open.position.lat}
      longitude={open.position.lon}
      offset={8}
      closeOnClick={false}
      onClose={() => setOpenKey((prev) => (prev === open.key ? null : prev))}
    >
      <UnitDetails unit={open.unit} position={open.position} />
    </Popup>
  );
}

function cachedSymbolUrl(
  cache: Map<string, string | null>,
  unit: Unit,
): string | null {
  const cacheKey = JSON.stringify([unit.symbol, unit.tacticalName]);
  let url = cache.get(cacheKey);
  if (url === undefined) {
    url = symbolDataUrl(unit.symbol, unit.tacticalName);
    cache.set(cacheKey, url);
  }
  return url;
}
