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
}: SettingsDialogProps) {
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);
  const [newOverlayName, setNewOverlayName] = useState('');
  const [newOverlayUrl, setNewOverlayUrl] = useState('');
  const [newOverlayAuthHeader, setNewOverlayAuthHeader] = useState('');

  useEffect(() => {
    if (open) {
      setStyleUrlDraft(styleUrl);
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
                {overlays.map((overlay) => (
                  <ListItem
                    key={overlay.id}
                    disablePadding
                    secondaryAction={
                      <IconButton
                        edge="end"
                        aria-label={`Remove ${overlay.name}`}
                        onClick={() => onRemoveOverlay(overlay.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
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
                ))}
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
