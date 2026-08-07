import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
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
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  buildMarkersFromRows,
  CSV_DELIMITERS,
  detectDelimiter,
  guessColumnMapping,
  looksLikeHeaderRow,
  parseCsvRows,
} from '../lib/markers';
import type { ColumnMapping, MarkersImportResult } from '../lib/markers';

const CUSTOM_DELIMITER = 'custom';
const PREVIEW_ROW_COUNT = 5;

interface CsvImportDialogProps {
  open: boolean;
  csvText: string;
  onClose: () => void;
  onImport: (result: MarkersImportResult) => void;
}

type MappingField = keyof ColumnMapping;

interface InitialCsvState {
  delimiterChoice: string;
  customDelimiter: string;
  hasHeader: boolean;
  mapping: ColumnMapping;
}

function computeInitialState(csvText: string): InitialCsvState {
  const detected = detectDelimiter(csvText);
  const isKnownDelimiter = CSV_DELIMITERS.some(
    (option) => option.value === detected,
  );
  const rows = parseCsvRows(csvText, detected);
  const headerDetected = looksLikeHeaderRow(rows[0]);
  const mapping = headerDetected
    ? guessColumnMapping(rows[0])
    : {
        name: rows[0]?.[0] !== undefined ? 0 : null,
        lat: rows[0]?.[1] !== undefined ? 1 : null,
        lng: rows[0]?.[2] !== undefined ? 2 : null,
      };
  return {
    delimiterChoice: isKnownDelimiter ? detected : CUSTOM_DELIMITER,
    customDelimiter: isKnownDelimiter ? '' : detected,
    hasHeader: headerDetected,
    mapping,
  };
}

export function CsvImportDialog({
  open,
  csvText,
  onClose,
  onImport,
}: CsvImportDialogProps) {
  // Computed once on mount; the parent remounts this component (via `key`)
  // whenever a new file is selected, so re-deriving these from csvText in
  // an effect isn't necessary.
  const [initialState] = useState(() => computeInitialState(csvText));
  const [delimiterChoice, setDelimiterChoice] = useState(
    initialState.delimiterChoice,
  );
  const [customDelimiter, setCustomDelimiter] = useState(
    initialState.customDelimiter,
  );
  const [hasHeader, setHasHeader] = useState(initialState.hasHeader);
  const [mapping, setMapping] = useState<ColumnMapping>(initialState.mapping);

  const activeDelimiter =
    delimiterChoice === CUSTOM_DELIMITER ? customDelimiter : delimiterChoice;

  const allRows = useMemo(
    () => parseCsvRows(csvText, activeDelimiter || ','),
    [csvText, activeDelimiter],
  );

  const headerRow = hasHeader ? allRows[0] : undefined;
  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  const columnCount = allRows.reduce(
    (max, row) => Math.max(max, row.length),
    0,
  );
  const columnLabels = Array.from({ length: columnCount }, (_, index) =>
    headerRow?.[index]?.trim() ? headerRow[index] : `Column ${index + 1}`,
  );

  const result = useMemo(
    () => buildMarkersFromRows(dataRows, mapping),
    [dataRows, mapping],
  );

  const mappingComplete =
    mapping.name !== null && mapping.lat !== null && mapping.lng !== null;

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

  const handleImport = () => {
    onImport(result);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Import markers from CSV</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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
                <MenuItem value={CUSTOM_DELIMITER}>Custom</MenuItem>
              </Select>
            </FormControl>
            {delimiterChoice === CUSTOM_DELIMITER ? (
              <TextField
                label="Custom delimiter"
                size="small"
                value={customDelimiter}
                onChange={(event) => setCustomDelimiter(event.target.value)}
                sx={{ width: 160 }}
                slotProps={{ htmlInput: { maxLength: 1 } }}
              />
            ) : null}
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
            {(['name', 'lat', 'lng'] as MappingField[]).map((field) => (
              <FormControl key={field} size="small" fullWidth>
                <InputLabel id={`csv-map-${field}-label`}>
                  {field === 'name'
                    ? 'Name column'
                    : field === 'lat'
                      ? 'Latitude column'
                      : 'Longitude column'}
                </InputLabel>
                <Select
                  labelId={`csv-map-${field}-label`}
                  label={
                    field === 'name'
                      ? 'Name column'
                      : field === 'lat'
                        ? 'Latitude column'
                        : 'Longitude column'
                  }
                  value={mapping[field] === null ? '' : String(mapping[field])}
                  onChange={handleMappingChange(field)}
                >
                  <MenuItem value="">
                    <em>Not mapped</em>
                  </MenuItem>
                  {columnLabels.map((label, index) => (
                    <MenuItem key={index} value={index}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ))}
          </Stack>

          {columnCount === 0 ? (
            <Alert severity="warning">No data found in this file.</Alert>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 260 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {columnLabels.map((label, index) => (
                        <TableCell
                          key={index}
                          sx={{
                            fontWeight:
                              index === mapping.name ||
                              index === mapping.lat ||
                              index === mapping.lng
                                ? 700
                                : 400,
                          }}
                        >
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dataRows
                      .slice(0, PREVIEW_ROW_COUNT)
                      .map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {columnLabels.map((_, colIndex) => (
                            <TableCell key={colIndex}>
                              {row[colIndex] ?? ''}
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
            <Alert severity={result.markers.length > 0 ? 'success' : 'warning'}>
              {result.markers.length} marker
              {result.markers.length === 1 ? '' : 's'} ready to import
              {result.skipped > 0
                ? `, ${result.skipped} row${result.skipped === 1 ? '' : 's'} will be skipped (invalid data)`
                : ''}
              .
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!mappingComplete || result.markers.length === 0}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
