import Button from '@mui/material/Button';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useMarkers } from '../context/MarkersContext';
import type { LocalMarker } from '../types';
import { stringify } from 'csv-stringify/browser/esm/sync';

export function downloadMarkersCsv(markers: LocalMarker[]): void {
  const csv = stringify(
    markers.map((marker) => ({
      id: marker.id,
      name: marker.name,
      lat: marker.lat,
      lng: marker.lng,
    })),
    {
      header: true,
      columns: ['id', 'name', 'lat', 'lng'],
    },
  );

  const blob = new Blob([csv], {
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

export default function CSVExportButton() {
  const { markers } = useMarkers();

  return (
    <Button
      onClick={() => downloadMarkersCsv(markers)}
      disabled={markers.length === 0}
      startIcon={<FileDownloadIcon fontSize="small" />}
      sx={{ mr: 'auto' }}
    >
      Export CSV
    </Button>
  );
}
