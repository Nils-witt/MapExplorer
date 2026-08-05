import type { Map as MapLibreMap } from 'maplibre-gl';
import { Marker as MapLibreMarker } from 'maplibre-gl';
import type { LocalMarker } from './types';

export interface MarkerHandlers {
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, lng: number, lat: number) => void;
}

function createMarkerInstance(
  marker: LocalMarker,
  handlers: MarkerHandlers,
): MapLibreMarker {
  const instance = new MapLibreMarker({ draggable: true });

  instance.on('dragend', () => {
    const lngLat = instance.getLngLat();
    handlers.onMove(marker.id, lngLat.lng, lngLat.lat);
  });

  return instance;
}

export function syncMarkers(
  map: MapLibreMap,
  markers: LocalMarker[],
  instances: Map<string, MapLibreMarker>,
  handlers: MarkerHandlers,
): void {
  const currentIds = new Set(markers.map((marker) => marker.id));

  for (const [id, instance] of instances) {
    if (!currentIds.has(id)) {
      instance.remove();
      instances.delete(id);
    }
  }

  for (const marker of markers) {
    let instance = instances.get(marker.id);
    if (!instance) {
      instance = createMarkerInstance(marker, handlers);
      instance.setLngLat([marker.lng, marker.lat]);
      instance.addTo(map);
      instances.set(marker.id, instance);
      continue;
    }

    const lngLat = instance.getLngLat();
    if (lngLat.lng !== marker.lng || lngLat.lat !== marker.lat) {
      instance.setLngLat([marker.lng, marker.lat]);
    }
  }
}

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function markersToCsv(markers: LocalMarker[]): string {
  const rows = markers.map(
    (marker) => `${escapeCsvField(marker.name)},${marker.lat},${marker.lng}`,
  );
  return ['name,latitude,longitude', ...rows].join('\n');
}

export function downloadMarkersCsv(markers: LocalMarker[]): void {
  const blob = new Blob([markersToCsv(markers)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'markers.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
