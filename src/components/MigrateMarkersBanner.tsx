import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { LegacyLocalMarker } from '../types';
import {
  clearLegacyMarkers,
  loadLegacyMarkers,
  saveLegacyMarkers,
} from '../lib/storage';
import {
  describeGeoObjectError,
  useGeoObjects,
} from '../context/GeoObjectsContext';

export function MigrateMarkersBanner() {
  const { eligibleOverlays, createGeoObject, isOnline } = useGeoObjects();
  const [pending, setPending] = useState<LegacyLocalMarker[] | null>(null);
  const [targetOverlayId, setTargetOverlayId] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLegacyMarkers().then((legacy) => {
      if (!cancelled && legacy.length > 0) {
        setPending(legacy);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending || pending.length === 0) {
    return null;
  }

  const handleMigrate = async () => {
    if (!targetOverlayId) {
      return;
    }
    setMigrating(true);
    setError(null);
    const failed: LegacyLocalMarker[] = [];
    for (const marker of pending) {
      try {
        await createGeoObject(targetOverlayId, {
          name: marker.name,
          latitude: marker.lat,
          longitude: marker.lng,
        });
      } catch (err) {
        failed.push(marker);
        setError(describeGeoObjectError(err));
      }
    }
    setMigrating(false);
    // Rewrite storage to hold only the still-failed markers, so a
    // successfully-migrated marker isn't re-offered (and duplicated) on the
    // next attempt after a reload.
    await saveLegacyMarkers(failed);
    setPending(failed.length > 0 ? failed : null);
  };

  const handleDiscard = async () => {
    if (
      !window.confirm(
        `Discard ${pending.length} old marker${pending.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return;
    }
    await clearLegacyMarkers();
    setPending(null);
  };

  return (
    <Alert severity="info" sx={{ mx: 2, my: 1 }}>
      <Stack spacing={1}>
        <Typography variant="body2">
          You have {pending.length} old local marker
          {pending.length === 1 ? '' : 's'} from before markers moved to the
          server. Migrate them to a connected map, or discard them.
        </Typography>
        {error ? (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <FormControl
            size="small"
            sx={{ minWidth: 200 }}
            disabled={eligibleOverlays.length === 0 || migrating}
          >
            <Select
              displayEmpty
              value={targetOverlayId}
              onChange={(event: SelectChangeEvent) =>
                setTargetOverlayId(event.target.value)
              }
            >
              <MenuItem value="">
                <em>
                  {eligibleOverlays.length === 0
                    ? 'Enable a server map first'
                    : 'Choose a map'}
                </em>
              </MenuItem>
              {eligibleOverlays.map((overlay) => (
                <MenuItem key={overlay.id} value={overlay.id}>
                  {overlay.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="outlined"
            onClick={handleMigrate}
            disabled={!targetOverlayId || !isOnline || migrating}
            startIcon={migrating ? <CircularProgress size={14} /> : undefined}
          >
            Migrate
          </Button>
          <Button size="small" onClick={handleDiscard} disabled={migrating}>
            Discard
          </Button>
          {!isOnline ? (
            <Typography variant="caption" color="text.secondary">
              You&apos;re offline - connect to migrate.
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Alert>
  );
}
