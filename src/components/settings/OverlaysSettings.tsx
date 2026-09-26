import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { useConnectedServers } from '../../context/ConnectedServersContext.tsx';
import { useOverlays } from '../../context/OverlaysContext.tsx';
import OverlayCacheButton from './OverlayCacheButton.tsx';
import { deleteAllCaches, isTileCacheSupported } from '../../lib/tileCache.ts';

export default function OverlaysSettings() {
  const { overlayServers } = useConnectedServers();
  const {
    overlays,
    enabledOverlayIds,
    setOverlayEnabled,
    moveOverlay,
    enabledOverlays,
    getOverlayOpacity,
    setOverlayOpacity,
    getOverlayVersion,
    setOverlayVersion,
  } = useOverlays();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  // Bumped after deleting so the cache buttons remount and recheck.
  const [cacheGeneration, setCacheGeneration] = useState(0);

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const count = await deleteAllCaches();
      setDeleteResult(`Deleted ${count} cache${count === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Failed to delete caches:', error);
      setDeleteResult('Failed to delete caches.');
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setCacheGeneration((prev) => prev + 1);
    }
  };

  return (
    <Stack spacing={1.5}>
      {enabledOverlays.length > 1 && (
        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            Draw order
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {/* Top-most overlay first. */}
              {enabledOverlays.toReversed().map((overlay, index, list) => (
                <ListItem
                  key={overlay.id}
                  divider={index < list.length - 1}
                  secondaryAction={
                    <>
                      <IconButton
                        size="small"
                        disabled={index === 0}
                        onClick={() => moveOverlay(overlay.id, 'up')}
                        aria-label={`Move ${overlay.name} up`}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        edge="end"
                        disabled={index === list.length - 1}
                        onClick={() => moveOverlay(overlay.id, 'down')}
                        aria-label={`Move ${overlay.name} down`}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </>
                  }
                >
                  <ListItemText primary={overlay.name} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Stack>
      )}
      {overlayServers.map((server) => {
        const serverOverlays = overlays[server.id] ?? [];
        return (
          <Stack key={server.id} spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              {server.name}
            </Typography>
            {serverOverlays.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No overlays available.
              </Typography>
            ) : (
              <Paper variant="outlined">
                <List dense disablePadding>
                  {serverOverlays.map((overlay, index) => {
                    const enabled = enabledOverlayIds.includes(overlay.uuid);
                    const version = getOverlayVersion(overlay);
                    // Cached overlays from before versions were fetched have
                    // none listed, but the current one always exists.
                    const versionOptions = overlay.versions.some(
                      (v) => v.version === overlay.currentVersion,
                    )
                      ? overlay.versions.map((v) => v.version)
                      : [
                          overlay.currentVersion,
                          ...overlay.versions.map((v) => v.version),
                        ];
                    return (
                      <ListItem
                        key={overlay.uuid}
                        divider={index < serverOverlays.length - 1}
                        secondaryAction={
                          <Switch
                            edge="end"
                            size="small"
                            checked={enabled}
                            onChange={(event) =>
                              setOverlayEnabled(
                                overlay.uuid,
                                event.target.checked,
                              )
                            }
                            slotProps={{
                              input: { 'aria-label': `Show ${overlay.name}` },
                            }}
                          />
                        }
                      >
                        <ListItemText
                          primary={overlay.name}
                          secondary={[
                            `v${version}`,
                            overlay.syncRemoteName &&
                              `Mirrored from ${overlay.syncRemoteName}`,
                            overlay.description,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          slotProps={{ secondary: { noWrap: true } }}
                        />
                        {enabled && (
                          <Select
                            size="small"
                            variant="standard"
                            value={version}
                            onChange={(event) =>
                              setOverlayVersion(overlay, event.target.value)
                            }
                            inputProps={{
                              'aria-label': `${overlay.name} version`,
                            }}
                            sx={{ flexShrink: 0, ml: 2 }}
                          >
                            {versionOptions.map((option) => (
                              <MenuItem key={option} value={option}>
                                v{option}
                                {option === overlay.currentVersion &&
                                  ' (current)'}
                              </MenuItem>
                            ))}
                          </Select>
                        )}
                        {enabled && (
                          <Slider
                            size="small"
                            min={0}
                            max={1}
                            step={0.05}
                            value={getOverlayOpacity(overlay.uuid)}
                            onChange={(_event, value) =>
                              setOverlayOpacity(overlay.uuid, value)
                            }
                            valueLabelDisplay="auto"
                            valueLabelFormat={(value) =>
                              `${Math.round(value * 100)}%`
                            }
                            aria-label={`${overlay.name} opacity`}
                            sx={{ width: 120, flexShrink: 0, mx: 2 }}
                          />
                        )}
                        <OverlayCacheButton
                          key={cacheGeneration}
                          server={server}
                          overlay={overlay}
                          version={version}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            )}
          </Stack>
        );
      })}
      {isTileCacheSupported() && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', justifyContent: 'flex-end' }}
        >
          {deleteResult && (
            <Typography variant="body2" color="text.secondary">
              {deleteResult}
            </Typography>
          )}
          <Button
            color="error"
            variant="outlined"
            onClick={() => {
              setDeleteResult(null);
              setConfirmOpen(true);
            }}
          >
            Delete all caches
          </Button>
        </Stack>
      )}
      <Dialog
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
      >
        <DialogTitle>Delete all caches?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every overlay cached for offline use and all map tiles and styles
            cached while browsing will be deleted. They are downloaded again
            when next needed, which requires a connection.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            color="error"
            onClick={() => void handleDeleteAll()}
            disabled={deleting}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
