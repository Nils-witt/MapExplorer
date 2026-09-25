import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import UserSettingsComponent from './UserSettingsComponent';
import ConnectedServersSettings from './settings/ConnectedServersSettings.tsx';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  type OpenTabs = 'user' | 'connectedServers';

  const [openTabs, setOpenTabs] = useState<OpenTabs>('user');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Map settings</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
          <Stack spacing={1} sx={{ minWidth: 200, flexShrink: 0 }}>
            <Button
              variant={openTabs === 'user' ? 'contained' : 'outlined'}
              onClick={() => setOpenTabs('user')}
            >
              User
            </Button>
            <Button
              variant={
                openTabs === 'connectedServers' ? 'contained' : 'outlined'
              }
              onClick={() => setOpenTabs('connectedServers')}
            >
              Connected Servers
            </Button>
          </Stack>
          <Box>
            <Stack sx={{ pt: 1 }}>
              {openTabs === 'connectedServers' && <ConnectedServersSettings />}
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
