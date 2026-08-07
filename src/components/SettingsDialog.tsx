import { useEffect, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import OpacityIcon from '@mui/icons-material/Opacity';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import type { Overlay } from '../types';
import { DEFAULT_OVERLAY_OPACITY } from '../lib/overlayMap';
import { useOverlays } from '../context/OverlaysContext';
import { useServers } from '../context/ServersContext';
import { ServerMapsSection } from './ServerMapsSection';
import { OverlayCacheButton } from './OverlayCacheButton';
import { CacheBackgroundTilesButton } from './CacheBackgroundTilesButton';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  styleUrl: string;
  onApplyStyle: (url: string) => void;
}

export function SettingsDialog({
  open,
  onClose,
  styleUrl,
  onApplyStyle,
}: SettingsDialogProps) {
  const {
    overlays,
    toggleOverlay: onToggleOverlay,
    addOverlay: onAddOverlay,
    changeOverlayOpacity: onChangeOverlayOpacity,
    removeOverlay: onRemoveOverlay,
    editOverlay: onEditOverlay,
    moveOverlay: onMoveOverlay,
  } = useOverlays();
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);
  const [newOverlayName, setNewOverlayName] = useState('');
  const [newOverlayUrl, setNewOverlayUrl] = useState('');
  const [newOverlayAuthHeader, setNewOverlayAuthHeader] = useState('');
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTilesUrl, setEditTilesUrl] = useState('');
  const [editAuthHeader, setEditAuthHeader] = useState('');

  // Servers live in a shared context (also read by App for live tile
  // authorization), so a sign-in in ServerMapsSection is immediately
  // reflected in signedInServers below without re-reading storage.
  const { servers } = useServers();
  const signedInServers = servers.filter((server) => server.token);
  const [tokenMenu, setTokenMenu] = useState<{
    anchorEl: HTMLElement;
    target: 'new' | 'edit';
  } | null>(null);

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

  const applyServerToken = (target: 'new' | 'edit', token: string) => {
    if (target === 'new') {
      setNewOverlayAuthHeader(`Bearer ${token}`);
    } else {
      setEditAuthHeader(`Bearer ${token}`);
    }
  };

  const handleUseServerToken = (
    event: MouseEvent<HTMLElement>,
    target: 'new' | 'edit',
  ) => {
    if (signedInServers.length === 1) {
      applyServerToken(target, signedInServers[0].token);
      return;
    }
    setTokenMenu({ anchorEl: event.currentTarget, target });
  };

  const handleSelectServerToken = (token: string) => {
    if (tokenMenu) {
      applyServerToken(tokenMenu.target, token);
    }
    setTokenMenu(null);
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
              <>
                <Typography variant="body2" color="text.secondary">
                  Order controls stacking on the map — the top overlay below is
                  drawn on top.
                </Typography>
                <List dense disablePadding>
                  {overlays.map((overlay, index) =>
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
                              slotProps={{
                                input: {
                                  endAdornment:
                                    signedInServers.length > 0 ? (
                                      <InputAdornment position="end">
                                        <Tooltip title="Use server token">
                                          <IconButton
                                            size="small"
                                            edge="end"
                                            aria-label="Use server token"
                                            onClick={(event) =>
                                              handleUseServerToken(
                                                event,
                                                'edit',
                                              )
                                            }
                                          >
                                            <VpnKeyIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      </InputAdornment>
                                    ) : undefined,
                                },
                              }}
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
                        sx={{ display: 'block', pr: 22, py: 0.5 }}
                        secondaryAction={
                          <Stack direction="row" spacing={0.5}>
                            <OverlayCacheButton
                              overlay={overlay}
                              servers={servers}
                            />
                            <IconButton
                              edge="end"
                              aria-label={`Move ${overlay.name} up`}
                              disabled={index === 0}
                              onClick={() => onMoveOverlay(overlay.id, 'up')}
                            >
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label={`Move ${overlay.name} down`}
                              disabled={index === overlays.length - 1}
                              onClick={() => onMoveOverlay(overlay.id, 'down')}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
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
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: 'center', pl: 5, pr: 2 }}
                        >
                          <OpacityIcon fontSize="small" color="action" />
                          <Slider
                            size="small"
                            value={overlay.opacity ?? DEFAULT_OVERLAY_OPACITY}
                            min={0}
                            max={1}
                            step={0.05}
                            aria-label={`${overlay.name} opacity`}
                            onChange={(_event, value) =>
                              onChangeOverlayOpacity(
                                overlay.id,
                                Array.isArray(value) ? value[0] : value,
                              )
                            }
                          />
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ minWidth: 36, textAlign: 'right' }}
                          >
                            {Math.round(
                              (overlay.opacity ?? DEFAULT_OVERLAY_OPACITY) *
                                100,
                            )}
                            %
                          </Typography>
                        </Stack>
                      </ListItem>
                    ),
                  )}
                </List>
                <CacheBackgroundTilesButton
                  overlays={overlays}
                  servers={servers}
                  styleUrl={styleUrl}
                />
              </>
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
                  slotProps={{
                    input: {
                      endAdornment:
                        signedInServers.length > 0 ? (
                          <InputAdornment position="end">
                            <Tooltip title="Use server token">
                              <IconButton
                                size="small"
                                edge="end"
                                aria-label="Use server token"
                                onClick={(event) =>
                                  handleUseServerToken(event, 'new')
                                }
                              >
                                <VpnKeyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ) : undefined,
                    },
                  }}
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

          <Divider />

          <ServerMapsSection />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      <Menu
        anchorEl={tokenMenu?.anchorEl ?? null}
        open={tokenMenu !== null}
        onClose={() => setTokenMenu(null)}
      >
        {signedInServers.map((server) => (
          <MenuItem
            key={server.id}
            onClick={() => handleSelectServerToken(server.token)}
          >
            {server.username ? `${server.username} — ` : ''}
            {server.baseUrl || 'Server'}
          </MenuItem>
        ))}
      </Menu>
    </Dialog>
  );
}
