import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import { useConnectedServers } from '../../context/ConnectedServersContext.tsx';
import { useOverlays } from '../../context/OverlaysContext.tsx';

export default function OverlaysSettings() {
  const { overlayServers } = useConnectedServers();
  const {
    overlays,
    enabledOverlayIds,
    setOverlayEnabled,
    getOverlayOpacity,
    setOverlayOpacity,
  } = useOverlays();

  return (
    <Stack spacing={1.5}>
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
                            `v${overlay.currentVersion}`,
                            overlay.syncRemoteName &&
                              `Mirrored from ${overlay.syncRemoteName}`,
                            overlay.description,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          slotProps={{ secondary: { noWrap: true } }}
                        />
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
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
