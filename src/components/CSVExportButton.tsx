import Button from '@mui/material/Button';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useGeoObjects } from '../context/GeoObjectsContext';
import type { GeoObjectEntry } from '../types';
import { stringify } from 'csv-stringify/browser/esm/sync';

export function downloadMarkersCsv(entries: GeoObjectEntry[]): void {
  const csv = stringify(
    entries.map((entry) => ({
      uuid: entry.geoObject.uuid,
      mapUuid: entry.geoObject.mapUuid,
      version: entry.geoObject.version,
      name: entry.geoObject.name,
      lat: entry.geoObject.latitude,
      lng: entry.geoObject.longitude,
      externalId: entry.geoObject.externalId ?? '',
      street: entry.geoObject.street ?? '',
      housenumber: entry.geoObject.housenumber ?? '',
      postcode: entry.geoObject.postcode ?? '',
      city: entry.geoObject.city ?? '',
      cityDistrict: entry.geoObject.cityDistrict ?? '',
    })),
    {
      header: true,
      columns: [
        'uuid',
        'mapUuid',
        'version',
        'name',
        'lat',
        'lng',
        'externalId',
        'street',
        'housenumber',
        'postcode',
        'city',
        'cityDistrict',
      ],
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
  const { allGeoObjects } = useGeoObjects();

  return (
    <Button
      onClick={() => downloadMarkersCsv(allGeoObjects)}
      disabled={allGeoObjects.length === 0}
      startIcon={<FileDownloadIcon fontSize="small" />}
      sx={{ mr: 'auto' }}
    >
      Export CSV
    </Button>
  );
}
