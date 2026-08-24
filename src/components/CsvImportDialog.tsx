import { useMemo, useState, type ChangeEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

import { parse as parsecsv } from 'csv-parse/browser/esm/sync';
import {
  describeGeoObjectError,
  useGeoObjects,
} from '../context/GeoObjectsContext';
import type { GeoObjectRequest } from '../api/serverApi';
import VisuallyHiddenInput from './VisuallyHiddenInput';

export const IMPORT_COLUMNS = [
  'id',
  'externalId',
  'name',
  'lat',
  'lng',
  'street',
  'housenumber',
  'postcode',
  'city',
  'cityDistrict',
] as const;
export interface ColumnMapping {
  id: number | null;
  externalId: number | null;
  name: number | null;
  lat: number | null;
  lng: number | null;
  street: number | null;
  housenumber: number | null;
  postcode: number | null;
  city: number | null;
  cityDistrict: number | null;
}

export interface ImportRow {
  id?: string;
  request: GeoObjectRequest;
}

export interface MarkersImportResult {
  rows: ImportRow[];
  skipped: number;
}

type MappingField = keyof ColumnMapping;

const PREVIEW_ROW_COUNT = 5;

export const CSV_DELIMITERS: { value: string; label: string }[] = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];

const FIELD_LABELS: Record<MappingField, string> = {
  id: 'ID column (optional - updates existing marker if set)',
  externalId: 'External ID column (optional)',
  name: 'Name column',
  lat: 'Latitude column',
  lng: 'Longitude column',
  street: 'Street column (optional)',
  housenumber: 'House number column (optional)',
  postcode: 'Postcode column (optional)',
  city: 'City column (optional)',
  cityDistrict: 'City district column (optional)',
};

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CsvImportDialog({ open, onClose }: CsvImportDialogProps) {
  const { eligibleOverlays, isOnline, createGeoObject, updateGeoObject } =
    useGeoObjects();

  const [targetOverlayId, setTargetOverlayId] = useState('');
  const [csvText, setCsvText] = useState('');

  const [delimiterChoice, setDelimiterChoice] = useState<string>(';');
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>({
    id: null,
    externalId: null,
    name: null,
    lat: null,
    lng: null,
    street: null,
    housenumber: null,
    postcode: null,
    city: null,
    cityDistrict: null,
  });
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const { rows: allRows, error: parseError } = useMemo(():
    { rows: string[][]; error: null } | { rows: []; error: string } => {
    if (!csvText) {
      return { rows: [], error: null };
    }
    try {
      return {
        rows: parsecsv(csvText, {
          columns: false,
          delimiter: delimiterChoice,
          skip_empty_lines: true,
        }) as string[][],
        error: null,
      };
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : 'Failed to parse CSV.',
      };
    }
  }, [csvText, delimiterChoice]);

  const headerRow = hasHeader ? allRows[0] : undefined;
  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  const handleImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const text = await file.text();
    setCsvText(text);
    // Column indices from a previously loaded file don't apply to this one.
    setMapping({
      id: null,
      externalId: null,
      name: null,
      lat: null,
      lng: null,
      street: null,
      housenumber: null,
      postcode: null,
      city: null,
      cityDistrict: null,
    });
    setImportSummary(null);
  };

  const columnCount = allRows.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );
  const columnLabels = useMemo(() => {
    if (hasHeader && headerRow) {
      return headerRow.map((field, index) => field || `Column ${index + 1}`);
    } else {
      return Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
    }
  }, [hasHeader, headerRow, columnCount]);

  const result = useMemo((): MarkersImportResult => {
    if (mapping.name === null || mapping.lat === null || mapping.lng === null) {
      return { rows: [], skipped: dataRows.length };
    }
    const idIndex = mapping.id;
    const nameIndex = mapping.name;
    const latIndex = mapping.lat;
    const lngIndex = mapping.lng;
    const externalIdIndex = mapping.externalId;
    const streetIndex = mapping.street;
    const housenumberIndex = mapping.housenumber;
    const postcodeIndex = mapping.postcode;
    const cityIndex = mapping.city;
    const cityDistrictIndex = mapping.cityDistrict;

    const optionalField = (row: string[], index: number | null) =>
      index !== null ? (row[index] ?? '').trim() || undefined : undefined;

    const rows: ImportRow[] = [];
    let skipped = 0;
    dataRows.forEach((row) => {
      const name = (row[nameIndex] ?? '').trim();
      const lat = Number.parseFloat(row[latIndex] ?? '');
      const lng = Number.parseFloat(row[lngIndex] ?? '');
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
      rows.push({
        id: optionalField(row, idIndex),
        request: {
          name,
          latitude: lat,
          longitude: lng,
          externalId: optionalField(row, externalIdIndex),
          street: optionalField(row, streetIndex),
          housenumber: optionalField(row, housenumberIndex),
          postcode: optionalField(row, postcodeIndex),
          city: optionalField(row, cityIndex),
          cityDistrict: optionalField(row, cityDistrictIndex),
        },
      });
    });
    return { rows, skipped };
  }, [dataRows, mapping]);

  const mappingComplete =
    mapping.name !== null && mapping.lat !== null && mapping.lng !== null;

  const updateCount = useMemo(
    () => result.rows.filter((row) => row.id).length,
    [result.rows],
  );

  const handleDelimiterChange = (event: SelectChangeEvent) => {
    setDelimiterChoice(event.target.value);
  };

  const handleMappingChange =
    (field: MappingField) => (event: SelectChangeEvent) => {
      const value = event.target.value;
      setMapping((prev) => ({
        ...prev,
        [field]: value === '' ? null : Number(value),
      }));
    };

  const handleImport = async () => {
    if (!targetOverlayId) {
      return;
    }
    setImporting(true);
    setImportSummary(null);
    let succeeded = 0;
    let failed = 0;
    for (const row of result.rows) {
      try {
        if (row.id) {
          await updateGeoObject(targetOverlayId, row.id, row.request);
        } else {
          await createGeoObject(targetOverlayId, row.request);
        }
        succeeded += 1;
      } catch (err) {
        failed += 1;
        if (failed === 1) {
          setImportSummary(describeGeoObjectError(err));
        }
      }
    }
    setImporting(false);
    if (failed === 0) {
      onClose();
    } else {
      setImportSummary(
        `${succeeded} marker${succeeded === 1 ? '' : 's'} imported, ${failed} failed.`,
      );
    }
  };

  const importDisabled =
    !mappingComplete ||
    result.rows.length === 0 ||
    !targetOverlayId ||
    !isOnline ||
    importing;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Import markers from CSV</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <FormControl
            size="small"
            fullWidth
            disabled={eligibleOverlays.length === 0}
          >
            <InputLabel id="csv-target-map-label">Import to map</InputLabel>
            <Select
              labelId="csv-target-map-label"
              label="Import to map"
              value={targetOverlayId}
              onChange={(event: SelectChangeEvent) =>
                setTargetOverlayId(event.target.value)
              }
            >
              {eligibleOverlays.map((overlay) => (
                <MenuItem key={overlay.id} value={overlay.id}>
                  {overlay.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {eligibleOverlays.length === 0 ? (
            <Alert severity="info">
              Enable a server map before importing markers.
            </Alert>
          ) : !isOnline ? (
            <Alert severity="warning">
              You&apos;re offline - importing requires a connection.
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              component="label"
              role={undefined}
              variant="contained"
              tabIndex={-1}
              startIcon={<CloudUploadIcon />}
            >
              Upload file
              <VisuallyHiddenInput
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportFileChange}
              />
            </Button>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="csv-delimiter-label">Delimiter</InputLabel>
              <Select
                labelId="csv-delimiter-label"
                label="Delimiter"
                value={delimiterChoice}
                onChange={handleDelimiterChange}
              >
                {CSV_DELIMITERS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={hasHeader}
                  onChange={(event) => setHasHeader(event.target.checked)}
                />
              }
              label="First row is a header"
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {IMPORT_COLUMNS.map((field) => (
              <FormControl key={field} size="small" fullWidth>
                <InputLabel id={`csv-map-${field}-label`}>
                  {FIELD_LABELS[field]}
                </InputLabel>
                <Select
                  labelId={`csv-map-${field}-label`}
                  label={FIELD_LABELS[field]}
                  value={mapping[field] === null ? '' : String(mapping[field])}
                  onChange={handleMappingChange(field)}
                >
                  <MenuItem value="">
                    <em>Not mapped</em>
                  </MenuItem>
                  {columnLabels.map((label, index) => (
                    <MenuItem key={index} value={String(index)}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ))}
          </Stack>

          {parseError ? (
            <Alert severity="error">
              Could not parse this file as CSV: {parseError}
            </Alert>
          ) : columnCount === 0 ? (
            <Alert severity="warning">No data found in this file.</Alert>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 260 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {IMPORT_COLUMNS.map((label, index) => (
                        <TableCell key={index}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dataRows
                      .slice(0, PREVIEW_ROW_COUNT)
                      .map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {IMPORT_COLUMNS.map((value, colIndex) => (
                            <TableCell key={colIndex}>
                              {mapping[value] !== null
                                ? row[mapping[value]!]
                                : ''}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {dataRows.length > PREVIEW_ROW_COUNT ? (
                <Typography variant="body2" color="text.secondary">
                  Showing {PREVIEW_ROW_COUNT} of {dataRows.length} rows.
                </Typography>
              ) : null}
            </>
          )}

          {!mappingComplete && columnCount > 0 ? (
            <Alert severity="info">
              Select a column for name, latitude, and longitude to continue.
            </Alert>
          ) : null}
          {mappingComplete ? (
            <Alert severity={result.rows.length > 0 ? 'success' : 'warning'}>
              {result.rows.length} marker
              {result.rows.length === 1 ? '' : 's'} ready to import
              {updateCount > 0
                ? ` (${updateCount} will update existing marker${updateCount === 1 ? '' : 's'}, ${result.rows.length - updateCount} new)`
                : ''}
              {result.skipped > 0
                ? `, ${result.skipped} row${result.skipped === 1 ? '' : 's'} will be skipped (invalid data)`
                : ''}
              .
            </Alert>
          ) : null}
          {importSummary ? (
            <Alert severity="warning">{importSummary}</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={importDisabled}
          startIcon={importing ? <CircularProgress size={14} /> : undefined}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
