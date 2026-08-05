import type { LocalMarker } from './types';

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
