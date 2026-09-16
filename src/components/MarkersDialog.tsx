import { lazy, Suspense, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import TuneIcon from '@mui/icons-material/Tune';
import EditIcon from '@mui/icons-material/Edit';
import EditRoadIcon from '@mui/icons-material/EditRoad';

import FileUploadIcon from '@mui/icons-material/FileUpload';
import SyncIcon from '@mui/icons-material/Sync';
import type { GeoObjectEntry } from '../types';

import { BulkEditAddressDialog } from './BulkEditAddressDialog';
import { EditGeoObjectDialog } from './EditGeoObjectDialog';
import { MigrateMarkersBanner } from './MigrateMarkersBanner';
import {
  describeGeoObjectError,
  useGeoObjects,
} from '../context/GeoObjectsContext';
import CSVExportButton from './CSVExportButton';
import EditLocationAltIcon from '@mui/icons-material/EditLocationAlt';

// CSV import pulls in a parser library and a table UI that most sessions
// never use, so it's kept out of this dialog's own chunk until opened.
const CsvImportDialog = lazy(() =>
  import('./CsvImportDialog').then((m) => ({ default: m.CsvImportDialog })),
);
const SyncMarkersDialog = lazy(() =>
  import('./SyncMarkersDialog').then((m) => ({
    default: m.SyncMarkersDialog,
  })),
);

interface MarkersDialogProps {
  open: boolean;
  onClose: () => void;
  onLocate: (uuid: string) => void;
  onRelocate: (uuid: string) => void;
  showMarkerLabels: boolean;
  onShowMarkerLabelsChange: (show: boolean) => void;
  showAllMarkers: boolean;
  onShowAllMarkersChange: (show: boolean) => void;
}

function formatCoordinate(entry: GeoObjectEntry): string {
  return `${entry.geoObject.latitude.toFixed(5)}, ${entry.geoObject.longitude.toFixed(5)}`;
}

export function MarkersDialog({
  open,
  onClose,
  onLocate,
  onRelocate,
  showMarkerLabels,
  onShowMarkerLabelsChange,
  showAllMarkers,
  onShowAllMarkersChange,
}: MarkersDialogProps) {
  const {
    allGeoObjects,
    errorsByOverlay,
    eligibleOverlays,
    activeOverlayId,
    setActiveOverlayId,
    isOnline,
    deleteGeoObject,
  } = useGeoObjects();
  const [editingEntry, setEditingEntry] = useState<GeoObjectEntry | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [importCsvLoaded, setImportCsvLoaded] = useState(false);

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncLoaded, setSyncLoaded] = useState(false);

  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const sortedGeoObjects = useMemo(
    () =>
      [...allGeoObjects].sort((a, b) =>
        a.geoObject.name.localeCompare(b.geoObject.name),
      ),
    [allGeoObjects],
  );

  const handleDialogClose = () => {
    onClose();
  };

  const handleDelete = async (entry: GeoObjectEntry) => {
    setDeletingUuid(entry.geoObject.uuid);
    try {
      await deleteGeoObject(entry.overlayId, entry.geoObject.uuid);
    } catch (err) {
      setActionError(describeGeoObjectError(err));
    } finally {
      setDeletingUuid(null);
    }
  };

  const toggleSelected = (uuid: string) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  const allSelected =
    sortedGeoObjects.length > 0 &&
    sortedGeoObjects.every((entry) => selectedUuids.has(entry.geoObject.uuid));

  const toggleSelectAll = () => {
    setSelectedUuids((prev) => {
      if (allSelected) {
        return new Set();
      }
      const next = new Set(prev);
      for (const entry of sortedGeoObjects) {
        next.add(entry.geoObject.uuid);
      }
      return next;
    });
  };

  const selectedEntries = useMemo(
    () =>
      allGeoObjects.filter((entry) => selectedUuids.has(entry.geoObject.uuid)),
    [allGeoObjects, selectedUuids],
  );

  const handleDeleteSelected = async () => {
    if (selectedEntries.length === 0) {
      return;
    }
    if (
      !window.confirm(
        `Delete ${selectedEntries.length} selected marker${selectedEntries.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setEditingEntry(null);
    setDeletingSelected(true);
    let failed = 0;
    for (const entry of selectedEntries) {
      try {
        await deleteGeoObject(entry.overlayId, entry.geoObject.uuid);
        setSelectedUuids((prev) => {
          const next = new Set(prev);
          next.delete(entry.geoObject.uuid);
          return next;
        });
      } catch {
        failed += 1;
      }
    }
    setDeletingSelected(false);
    if (failed > 0) {
      setActionError(
        `${failed} marker${failed === 1 ? '' : 's'} could not be deleted.`,
      );
    }
  };

  return (
    <Drawer
      anchor="right"
      variant="persistent"
      open={open}
      onClose={handleDialogClose}
    >
      <Box
        sx={{
          width: { xs: '100vw', sm: 360 },
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="h6">Markers</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <IconButton
              aria-label="Settings"
              onClick={() => setShowSettings(!showSettings)}
            >
              <TuneIcon fontSize="small" />
            </IconButton>
            <IconButton aria-label="Close" onClick={handleDialogClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Divider />
        {!isOnline ? (
          <Alert severity="warning" sx={{ mx: 2, my: 1 }}>
            You&apos;re offline - showing cached markers. New markers can&apos;t
            be created until you&apos;re back online.
          </Alert>
        ) : null}
        <MigrateMarkersBanner />
        {Object.entries(errorsByOverlay).map(([overlayId, message]) => (
          <Alert key={overlayId} severity="error" sx={{ mx: 2, my: 1 }}>
            {message}
          </Alert>
        ))}
        {actionError ? (
          <Alert
            severity="error"
            onClose={() => setActionError(null)}
            sx={{ mx: 2, my: 1 }}
          >
            {actionError}
          </Alert>
        ) : null}
        {showSettings && (
          <>
            {' '}
            <Box sx={{ px: 2, py: 0.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showAllMarkers}
                    onChange={(event) =>
                      onShowAllMarkersChange(event.target.checked)
                    }
                  />
                }
                label={
                  <Typography variant="body2">
                    Show all markers on map
                  </Typography>
                }
              />
            </Box>
            <Box sx={{ px: 2, py: 0.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showMarkerLabels}
                    onChange={(event) =>
                      onShowMarkerLabelsChange(event.target.checked)
                    }
                  />
                }
                label={
                  <Typography variant="body2">
                    Show marker names on map
                  </Typography>
                }
              />
            </Box>
            {eligibleOverlays.length > 0 ? (
              <Box sx={{ px: 2, py: 0.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="add-marker-overlay-label">
                    Add markers to
                  </InputLabel>
                  <Select
                    labelId="add-marker-overlay-label"
                    label="Add markers to"
                    value={activeOverlayId ?? ''}
                    displayEmpty
                    onChange={(event: SelectChangeEvent) =>
                      setActiveOverlayId(event.target.value || null)
                    }
                  >
                    {eligibleOverlays.map((overlay) => (
                      <MenuItem key={overlay.id} value={overlay.id}>
                        {overlay.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            ) : null}
          </>
        )}
        <Divider />
        {allGeoObjects.length > 0 ? (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ px: 2, py: 0.5, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={selectedUuids.size > 0 && !allSelected}
                  onChange={toggleSelectAll}
                />
              }
              label={
                <Typography variant="body2">
                  {selectedUuids.size > 0
                    ? `${selectedUuids.size} selected`
                    : 'Select all'}
                </Typography>
              }
            />
            <IconButton
              onClick={() => setBulkEditOpen(true)}
              disabled={selectedUuids.size === 0}
            >
              <EditRoadIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={handleDeleteSelected}
              disabled={selectedUuids.size === 0 || deletingSelected}
            >
              {deletingSelected ? (
                <CircularProgress size={14} />
              ) : (
                <DeleteIcon fontSize="small" />
              )}
            </IconButton>
          </Stack>
        ) : null}
        <Divider />
        <Box sx={{ px: 2, py: 1.5, overflowY: 'auto', flex: 1 }}>
          {allGeoObjects.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No markers yet. Enable a server map and use the marker tool on the
              map to add one.
            </Typography>
          ) : (
            <List dense disablePadding>
              {sortedGeoObjects.map((entry) => (
                <ListItem
                  key={entry.geoObject.uuid}
                  className="markers-list-row"
                  disablePadding
                  sx={{ pr: 10 }}
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        edge="end"
                        aria-label={`Move ${entry.geoObject.name}`}
                        onClick={() => onRelocate(entry.geoObject.uuid)}
                      >
                        <EditLocationAltIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label={`Edit ${entry.geoObject.name}`}
                        onClick={() => setEditingEntry(entry)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label={`Remove ${entry.geoObject.name}`}
                        onClick={() => handleDelete(entry)}
                        disabled={deletingUuid === entry.geoObject.uuid}
                      >
                        {deletingUuid === entry.geoObject.uuid ? (
                          <CircularProgress size={16} />
                        ) : (
                          <DeleteIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Stack>
                  }
                >
                  <Checkbox
                    size="small"
                    checked={selectedUuids.has(entry.geoObject.uuid)}
                    onChange={() => toggleSelected(entry.geoObject.uuid)}
                    onClick={(event) => event.stopPropagation()}
                    slotProps={{
                      input: {
                        'aria-label': `Select ${entry.geoObject.name}`,
                      },
                    }}
                  />
                  <ListItemButton
                    dense
                    onClick={() => {
                      onLocate(entry.geoObject.uuid);
                    }}
                  >
                    <ListItemText
                      primary={entry.geoObject.name}
                      secondary={`${formatCoordinate(entry)} \n ${entry.mapName}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.5 }}>
          <Button
            onClick={() => {
              setImportCsvLoaded(true);
              setImportCsvOpen(true);
            }}
            startIcon={<FileUploadIcon fontSize="small" />}
          >
            Import CSV
          </Button>
          <CSVExportButton />
          <Button
            onClick={() => {
              setSyncLoaded(true);
              setSyncOpen(true);
            }}
            startIcon={<SyncIcon fontSize="small" />}
          >
            Sync markers
          </Button>
        </Stack>
      </Box>
      {importCsvLoaded ? (
        <Suspense fallback={null}>
          <CsvImportDialog
            open={importCsvOpen}
            onClose={() => setImportCsvOpen(false)}
          />
        </Suspense>
      ) : null}
      {syncLoaded ? (
        <Suspense fallback={null}>
          <SyncMarkersDialog
            open={syncOpen}
            onClose={() => setSyncOpen(false)}
          />
        </Suspense>
      ) : null}
      <EditGeoObjectDialog
        open={editingEntry !== null}
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
      />
      <BulkEditAddressDialog
        open={bulkEditOpen}
        entries={selectedEntries}
        onClose={() => setBulkEditOpen(false)}
      />
    </Drawer>
  );
}
