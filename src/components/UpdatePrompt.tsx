import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Tells the user when a new version has been downloaded, and lets them reload
// into it instead of the service worker swapping versions under them.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <Snackbar
      open={needRefresh}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message="A new version of MapExplorer is available."
      action={
        <>
          <Button
            color="inherit"
            size="small"
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </Button>
          <Button
            color="primary"
            size="small"
            variant="contained"
            onClick={() => updateServiceWorker(true)}
          >
            Reload
          </Button>
        </>
      }
    />
  );
}
