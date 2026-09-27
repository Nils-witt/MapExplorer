import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import UserSettingsComponent from './UserSettingsComponent';
import MapSettingsComponent from './MapSettingsComponent';
import ConnectedServersSettings from './settings/ConnectedServersSettings.tsx';
import OverlaysSettings from './settings/OverlaysSettings.tsx';
import ServiceWorkerSettings from './settings/ServiceWorkerSettings.tsx';
import UnitsSettings from './settings/UnitsSettings.tsx';
import DisplaySettings from './settings/DisplaySettings.tsx';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  styleUrl: string;
  onApplyStyle: (url: string) => string;
}

type OpenTabs =
  | 'user'
  | 'map'
  | 'display'
  | 'connectedServers'
  | 'overlays'
  | 'units'
  | 'offline';

const TABS: { value: OpenTabs; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'map', label: 'Basemap' },
  { value: 'display', label: 'Display Options' },
  { value: 'connectedServers', label: 'Connected Servers' },
  { value: 'overlays', label: 'Overlays' },
  { value: 'units', label: 'Units' },
  { value: 'offline', label: 'Offline & Cache' },
];

export function SettingsDialog({
  open,
  onClose,
  styleUrl,
  onApplyStyle,
}: SettingsDialogProps) {
  const [openTabs, setOpenTabs] = useState<OpenTabs>('user');
  // On phones the dialog fills the screen and the tabs run along the top.
  const isSmallScreen = useMediaQuery(useTheme().breakpoints.down('sm'));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isSmallScreen}
      slotProps={{
        paper: {
          // Keep clear of the notch and home indicator in the fullscreen PWA.
          sx: isSmallScreen
            ? {
                pt: 'env(safe-area-inset-top)',
                pb: 'env(safe-area-inset-bottom)',
                pl: 'env(safe-area-inset-left)',
                pr: 'env(safe-area-inset-right)',
              }
            : undefined,
        },
      }}
    >
      <DialogTitle>Map settings</DialogTitle>
      <Stack
        direction={isSmallScreen ? 'column' : 'row'}
        sx={{ flexGrow: 1, minHeight: 0 }}
      >
        <Tabs
          orientation={isSmallScreen ? 'horizontal' : 'vertical'}
          variant="scrollable"
          scrollButtons={false}
          value={openTabs}
          onChange={(_event, value: OpenTabs) => setOpenTabs(value)}
          sx={{
            flexShrink: 0,
            borderColor: 'divider',
            ...(isSmallScreen
              ? { borderBottom: 1 }
              : { borderRight: 1, minWidth: 200 }),
          }}
        >
          {TABS.map(({ value, label }) => (
            <Tab
              key={value}
              value={value}
              label={label}
              sx={isSmallScreen ? undefined : { alignItems: 'flex-start' }}
            />
          ))}
        </Tabs>
        <DialogContent sx={{ minWidth: 0 }}>
          <Box sx={{ pt: 1 }}>
            {openTabs === 'connectedServers' && <ConnectedServersSettings />}
            {openTabs === 'user' && <UserSettingsComponent />}
            {openTabs === 'map' && (
              <MapSettingsComponent
                styleUrl={styleUrl}
                onApplyStyle={onApplyStyle}
              />
            )}
            {openTabs === 'display' && <DisplaySettings />}
            {openTabs === 'overlays' && <OverlaysSettings />}
            {openTabs === 'units' && <UnitsSettings />}
            {openTabs === 'offline' && <ServiceWorkerSettings />}
          </Box>
        </DialogContent>
      </Stack>
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
