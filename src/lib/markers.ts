import type { LocalMarker } from '../types';

const CSV_FIELD_NEEDS_QUOTING = /[",\n]/;
const CSV_QUOTE = /"/g;

function escapeCsvField(value: string): string {
  return CSV_FIELD_NEEDS_QUOTING.test(value)
    ? `"${value.replace(CSV_QUOTE, '""')}"`
    : value;
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

export function parseCsvRows(
  text: string,
  delimiter: string = ',',
): string[][] {
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
    } else if (char === delimiter) {
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

export const CSV_DELIMITERS: { value: string; label: string }[] = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const { value } of CSV_DELIMITERS) {
    const count = firstLine.split(value).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
}

const HEADER_FIELD_PATTERN = /name|lat|lo?ng/i;

export function looksLikeHeaderRow(row: string[] | undefined): boolean {
  return !!row && row.some((field) => HEADER_FIELD_PATTERN.test(field));
}

export interface ColumnMapping {
  name: number | null;
  lat: number | null;
  lng: number | null;
}

const NAME_FIELD_PATTERN = /name/i;
const LAT_FIELD_PATTERN = /lat/i;
const LNG_FIELD_PATTERN = /lo?ng/i;

export function guessColumnMapping(header: string[]): ColumnMapping {
  const findIndex = (pattern: RegExp): number | null => {
    const index = header.findIndex((field) => pattern.test(field));
    return index === -1 ? null : index;
  };
  return {
    name: findIndex(NAME_FIELD_PATTERN),
    lat: findIndex(LAT_FIELD_PATTERN),
    lng: findIndex(LNG_FIELD_PATTERN),
  };
}

export interface MarkersImportResult {
  markers: LocalMarker[];
  skipped: number;
}

export function buildMarkersFromRows(
  rows: string[][],
  mapping: ColumnMapping,
): MarkersImportResult {
  const markers: LocalMarker[] = [];
  let skipped = 0;

  if (mapping.name === null || mapping.lat === null || mapping.lng === null) {
    return { markers, skipped: rows.length };
  }

  const nameIndex = mapping.name;
  const latIndex = mapping.lat;
  const lngIndex = mapping.lng;

  rows.forEach((fields, index) => {
    const name = (fields[nameIndex] ?? '').trim();
    const lat = Number.parseFloat(fields[latIndex] ?? '');
    const lng = Number.parseFloat(fields[lngIndex] ?? '');
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
