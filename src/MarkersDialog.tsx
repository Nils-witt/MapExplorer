import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PlaceIcon from '@mui/icons-material/Place';
import SaveIcon from '@mui/icons-material/Save';
import type { LocalMarker } from './types';
import { downloadMarkersCsv } from './markers';
import type { MarkersImportResult } from './markers';
import { CsvImportDialog } from './CsvImportDialog';
import { useMarkers } from './MarkersContext';

interface MarkersDialogProps {
  open: boolean;
  onClose: () => void;
  onRemoveAll: () => void;
  onLocate: (id: string) => void;
}

function formatCoordinate(marker: LocalMarker): string {
  return `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`;
}

export function MarkersDialog({
  open,
  onClose,
  onRemoveAll,
  onLocate,
}: MarkersDialogProps) {
  const {
    markers,
    renameMarker: onRename,
    removeMarker: onRemove,
    importMarkers: onImport,
  } = useMarkers();
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [importCsvText, setImportCsvText] = useState<string | null>(null);
  const [importKey, setImportKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startEditMarker = (marker: LocalMarker) => {
    setEditingMarkerId(marker.id);
    setEditName(marker.name);
  };

  const cancelEditMarker = () => {
    setEditingMarkerId(null);
  };

  const handleEditSubmit = (event: FormEvent, id: string) => {
    event.preventDefault();
    const name = editName.trim();
    if (name) {
      onRename(id, name);
      setEditingMarkerId(null);
    }
  };

  const handleDialogClose = () => {
    setEditingMarkerId(null);
    onClose();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveAll = () => {
    if (
      window.confirm(
        `Delete all ${markers.length} marker${markers.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      setEditingMarkerId(null);
      onRemoveAll();
    }
  };

  const handleImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const text = await file.text();
    setImportCsvText(text);
    setImportKey((key) => key + 1);
  };

  const handleCsvImportDialogClose = () => {
    setImportCsvText(null);
  };

  const handleCsvImportConfirm = ({
    markers: imported,
    skipped,
  }: MarkersImportResult) => {
    if (imported.length > 0) {
      onImport(imported);
    }
    setImportCsvText(null);
    if (skipped > 0) {
      window.alert(
        `Imported ${imported.length} marker${imported.length === 1 ? '' : 's'}, skipped ${skipped} invalid row${skipped === 1 ? '' : 's'}.`,
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
              aria-label="Delete all markers"
              onClick={handleRemoveAll}
              disabled={markers.length === 0}
            >
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
            <IconButton aria-label="Close" onClick={handleDialogClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Divider />
        <Box sx={{ px: 2, py: 1.5, overflowY: 'auto', flex: 1 }}>
          {markers.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No markers placed yet. Use the marker tool on the map to add one.
            </Typography>
          ) : (
            <List dense disablePadding>
              {markers.map((marker) =>
                editingMarkerId === marker.id ? (
                  <ListItem
                    key={marker.id}
                    disablePadding
                    sx={{ display: 'block', py: 1 }}
                  >
                    <Stack
                      component="form"
                      direction="row"
                      spacing={1}
                      onSubmit={(event) => handleEditSubmit(event, marker.id)}
                    >
                      <TextField
                        label="Name"
                        size="small"
                        fullWidth
                        autoFocus
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                      <Button
                        type="submit"
                        variant="outlined"
                        size="small"
                        startIcon={<SaveIcon fontSize="small" />}
                      >
                        Save
                      </Button>
                      <Button
                        variant="text"
                        size="small"
                        onClick={cancelEditMarker}
                        startIcon={<CloseIcon fontSize="small" />}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </ListItem>
                ) : (
                  <ListItem
                    key={marker.id}
                    disablePadding
                    sx={{ pr: 10 }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5}>
                        <IconButton
                          edge="end"
                          aria-label={`Rename ${marker.name}`}
                          onClick={() => startEditMarker(marker)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          aria-label={`Remove ${marker.name}`}
                          onClick={() => onRemove(marker.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    }
                  >
                    <ListItemButton
                      dense
                      onClick={() => {
                        onLocate(marker.id);
                      }}
                    >
                      <PlaceIcon
                        fontSize="small"
                        color="action"
                        sx={{ mr: 1.5 }}
                      />
                      <ListItemText
                        primary={marker.name}
                        secondary={formatCoordinate(marker)}
                      />
                    </ListItemButton>
                  </ListItem>
                ),
              )}
            </List>
          )}
        </Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.5 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />
          <Button
            onClick={handleImportClick}
            startIcon={<FileUploadIcon fontSize="small" />}
          >
            Import CSV
          </Button>
          <Button
            onClick={() => downloadMarkersCsv(markers)}
            disabled={markers.length === 0}
            startIcon={<FileDownloadIcon fontSize="small" />}
            sx={{ mr: 'auto' }}
          >
            Export CSV
          </Button>
          <Button onClick={handleDialogClose}>Close</Button>
        </Stack>
      </Box>
      <CsvImportDialog
        key={importKey}
        open={importCsvText !== null}
        csvText={importCsvText ?? ''}
        onClose={handleCsvImportDialogClose}
        onImport={handleCsvImportConfirm}
      />
    </Drawer>
  );
}
