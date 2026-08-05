import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PlaceIcon from '@mui/icons-material/Place';
import SaveIcon from '@mui/icons-material/Save';
import type { LocalMarker } from './types';
import { downloadMarkersCsv } from './markers';

interface MarkersDialogProps {
  open: boolean;
  onClose: () => void;
  markers: LocalMarker[];
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onLocate: (id: string) => void;
}

function formatCoordinate(marker: LocalMarker): string {
  return `${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}`;
}

export function MarkersDialog({
  open,
  onClose,
  markers,
  onRename,
  onRemove,
  onLocate,
}: MarkersDialogProps) {
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
          <IconButton aria-label="Close" onClick={handleDialogClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
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
        <Stack direction="row" sx={{ px: 2, py: 1.5 }}>
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
    </Drawer>
  );
}
