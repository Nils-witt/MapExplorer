import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { MapSettingsComponent } from './MapSettingsComponent';
import ServerMapsSettingsComponent from './ServerMapsSettingsComponent';
import OverlaySettingsComponent from './OverlaySettingsComponent';
import MarkerSettingsComponent from './MarkerSettingsComponent';
import UserSettingsComponent from './UserSettingsComponent';

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
  type OpenTabs =
    'mapSettings' | 'markers' | 'overlays' | 'serverMaps' | 'user';

  const [openTabs, setOpenTabs] = useState<OpenTabs>('mapSettings');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Map settings</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
          <Stack spacing={1} sx={{ minWidth: 200, flexShrink: 0 }}>
            <Button
              variant={openTabs === 'mapSettings' ? 'contained' : 'outlined'}
              onClick={() => setOpenTabs('mapSettings')}
            >
              Map Settings
            </Button>
            <Button
              variant={openTabs === 'markers' ? 'contained' : 'outlined'}
              onClick={() => setOpenTabs('markers')}
            >
              Markers
            </Button>
            <Button
              variant={openTabs === 'overlays' ? 'contained' : 'outlined'}
              onClick={() => setOpenTabs('overlays')}
            >
              Overlays
            </Button>
            <Button
              variant={openTabs === 'serverMaps' ? 'contained' : 'outlined'}
              onClick={() => setOpenTabs('serverMaps')}
            >
              Server Maps
            </Button>
            <Button
              variant={openTabs === 'user' ? 'contained' : 'outlined'}
              onClick={() => setOpenTabs('user')}
            >
              User
            </Button>
          </Stack>
          <Box>
            <Stack sx={{ pt: 1 }}>
              {/* Map style settings */}
              {openTabs === 'mapSettings' && (
                <MapSettingsComponent
                  styleUrl={styleUrl}
                  onApplyStyle={onApplyStyle}
                />
              )}

              {openTabs === 'markers' && <MarkerSettingsComponent />}

              {openTabs === 'overlays' && (
                <OverlaySettingsComponent styleUrl={styleUrl} />
              )}
              {openTabs === 'serverMaps' && <ServerMapsSettingsComponent />}
              {openTabs === 'user' && <UserSettingsComponent />}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {[
            __APP_VERSION__ !== 'unknown' ? `v${__APP_VERSION__}` : null,
            __GIT_COMMIT__ !== 'unknown' ? `(${__GIT_COMMIT__})` : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </Typography>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
