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

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // skip, handled by the following \n
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((fields) => fields.some((value) => value.trim() !== ''));
}

export interface MarkersCsvImportResult {
  markers: LocalMarker[];
  skipped: number;
}

export function parseMarkersCsv(text: string): MarkersCsvImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { markers: [], skipped: 0 };
  }

  const [firstRow] = rows;
  const hasHeader =
    firstRow.length >= 3 &&
    /name/i.test(firstRow[0]) &&
    /lat/i.test(firstRow[1]) &&
    /lo?ng/i.test(firstRow[2]);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const markers: LocalMarker[] = [];
  let skipped = 0;

  dataRows.forEach((fields, index) => {
    const name = (fields[0] ?? '').trim();
    const lat = Number.parseFloat(fields[1] ?? '');
    const lng = Number.parseFloat(fields[2] ?? '');
    if (
      !name ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      skipped += 1;
      return;
    }
    markers.push({ id: `marker-${Date.now()}-${index}`, name, lat, lng });
  });

  return { markers, skipped };
}
