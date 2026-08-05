import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import type { Overlay } from './types';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  styleUrl: string;
  onApplyStyle: (url: string) => void;
  overlays: Overlay[];
  onToggleOverlay: (id: string) => void;
  onAddOverlay: (
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
  ) => void;
  onRemoveOverlay: (id: string) => void;
  onEditOverlay: (
    id: string,
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
  ) => void;
}

export function SettingsDialog({
  open,
  onClose,
  styleUrl,
  onApplyStyle,
  overlays,
  onToggleOverlay,
  onAddOverlay,
  onRemoveOverlay,
  onEditOverlay,
}: SettingsDialogProps) {
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);
  const [newOverlayName, setNewOverlayName] = useState('');
  const [newOverlayUrl, setNewOverlayUrl] = useState('');
  const [newOverlayAuthHeader, setNewOverlayAuthHeader] = useState('');
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTilesUrl, setEditTilesUrl] = useState('');
  const [editAuthHeader, setEditAuthHeader] = useState('');

  useEffect(() => {
    if (open) {
      setStyleUrlDraft(styleUrl);
    } else {
      setEditingOverlayId(null);
    }
  }, [open, styleUrl]);

  const handleStyleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = styleUrlDraft.trim();
    if (trimmed) {
      onApplyStyle(trimmed);
    }
  };

  const handleAddOverlaySubmit = (event: FormEvent) => {
    event.preventDefault();
    const name = newOverlayName.trim();
    const url = newOverlayUrl.trim();
    const authorizationHeader = newOverlayAuthHeader.trim();
    if (name && url) {
      onAddOverlay(name, url, authorizationHeader || undefined);
      setNewOverlayName('');
      setNewOverlayUrl('');
      setNewOverlayAuthHeader('');
    }
  };

  const startEditOverlay = (overlay: Overlay) => {
    setEditingOverlayId(overlay.id);
    setEditName(overlay.name);
    setEditTilesUrl(overlay.tiles.join(', '));
    setEditAuthHeader(overlay.authorizationHeader ?? '');
  };

  const cancelEditOverlay = () => {
    setEditingOverlayId(null);
  };

  const handleEditOverlaySubmit = (event: FormEvent, id: string) => {
    event.preventDefault();
    const name = editName.trim();
    const tilesUrl = editTilesUrl.trim();
    const authorizationHeader = editAuthHeader.trim();
    if (name && tilesUrl) {
      onEditOverlay(id, name, tilesUrl, authorizationHeader || undefined);
      setEditingOverlayId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Map settings</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Stack component="form" spacing={1.5} onSubmit={handleStyleSubmit}>
            <Typography variant="subtitle1">Map style</Typography>
            <TextField
              label="Style URL"
              type="url"
              size="small"
              fullWidth
              value={styleUrlDraft}
              onChange={(event) => setStyleUrlDraft(event.target.value)}
              placeholder="https://example.com/style.json"
            />
            <Button
              type="submit"
              variant="outlined"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
            >
              Apply style
            </Button>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Overlays</Typography>
            {overlays.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No overlays added yet.
              </Typography>
            ) : (
              <List dense disablePadding>
                {overlays.map((overlay) =>
                  editingOverlayId === overlay.id ? (
                    <ListItem
                      key={overlay.id}
                      disablePadding
                      sx={{ display: 'block', py: 1 }}
                    >
                      <Stack
                        component="form"
                        spacing={1}
                        onSubmit={(event) =>
                          handleEditOverlaySubmit(event, overlay.id)
                        }
                      >
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                        >
                          <TextField
                            label="Name"
                            size="small"
                            autoFocus
                            value={editName}
                            onChange={(event) =>
                              setEditName(event.target.value)
                            }
                          />
                          <TextField
                            label="Tile URL template(s)"
                            size="small"
                            fullWidth
                            value={editTilesUrl}
                            onChange={(event) =>
                              setEditTilesUrl(event.target.value)
                            }
                            placeholder="https://example.com/{z}/{x}/{y}.png"
                            helperText="Comma-separate multiple URLs"
                          />
                        </Stack>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                        >
                          <TextField
                            label="Authorization header (optional)"
                            size="small"
                            fullWidth
                            value={editAuthHeader}
                            onChange={(event) =>
                              setEditAuthHeader(event.target.value)
                            }
                            placeholder="Bearer <token>"
                          />
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{
                              alignSelf: { xs: 'flex-start', sm: 'center' },
                            }}
                          >
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
                              onClick={cancelEditOverlay}
                              startIcon={<CloseIcon fontSize="small" />}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      </Stack>
                    </ListItem>
                  ) : (
                    <ListItem
                      key={overlay.id}
                      disablePadding
                      sx={{ pr: 9 }}
                      secondaryAction={
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            edge="end"
                            aria-label={`Edit ${overlay.name}`}
                            onClick={() => startEditOverlay(overlay)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            edge="end"
                            aria-label={`Remove ${overlay.name}`}
                            onClick={() => onRemoveOverlay(overlay.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      }
                    >
                      <ListItemButton
                        dense
                        onClick={() => onToggleOverlay(overlay.id)}
                      >
                        <ListItemIcon sx={{ minWidth: 0 }}>
                          <Checkbox
                            edge="start"
                            tabIndex={-1}
                            disableRipple
                            checked={overlay.enabled}
                          />
                        </ListItemIcon>
                        <ListItemText primary={overlay.name} />
                      </ListItemButton>
                    </ListItem>
                  ),
                )}
              </List>
            )}

            <Stack
              component="form"
              spacing={1}
              onSubmit={handleAddOverlaySubmit}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Name"
                  size="small"
                  value={newOverlayName}
                  onChange={(event) => setNewOverlayName(event.target.value)}
                />
                <TextField
                  label="Tile URL template"
                  size="small"
                  fullWidth
                  value={newOverlayUrl}
                  onChange={(event) => setNewOverlayUrl(event.target.value)}
                  placeholder="https://example.com/{z}/{x}/{y}.png"
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Authorization header (optional)"
                  size="small"
                  fullWidth
                  value={newOverlayAuthHeader}
                  onChange={(event) =>
                    setNewOverlayAuthHeader(event.target.value)
                  }
                  placeholder="Bearer <token>"
                />
                <Button
                  type="submit"
                  variant="outlined"
                  size="small"
                  sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
