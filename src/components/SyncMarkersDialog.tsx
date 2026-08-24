import { useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { GeoObject, GeoObjectRequest } from '../api/serverApi';
import {
  createGeoObject as apiCreateGeoObject,
  listGeoObjects,
  listMapVersions,
} from '../api/serverApi';
import type { Overlay } from '../types';
import {
  describeGeoObjectError,
  useGeoObjects,
} from '../context/GeoObjectsContext';
import { useServers } from '../context/ServersContext';
import { compareVersionsDesc } from '../lib/version';

interface SyncMarkersDialogProps {
  open: boolean;
  onClose: () => void;
}

function toRequestFromGeoObject(geoObject: GeoObject): GeoObjectRequest {
  return {
    name: geoObject.name,
    latitude: geoObject.latitude,
    longitude: geoObject.longitude,
    externalId: geoObject.externalId,
    street: geoObject.street,
    housenumber: geoObject.housenumber,
    postcode: geoObject.postcode,
    city: geoObject.city,
    cityDistrict: geoObject.cityDistrict,
  };
}

// GeoObjects copied by this dialog always get a server-assigned uuid, so a
// re-run can't dedupe by id - match on the external id when present (the
// stable identity of a marker across maps/versions), else fall back to name
// + rounded coordinates, which is what a previous copy of the same marker
// would have.
function dedupeKey(geoObject: GeoObject): string {
  if (geoObject.externalId) {
    return `ext:${geoObject.externalId}`;
  }
  return `pos:${geoObject.name.trim().toLowerCase()}:${geoObject.latitude.toFixed(6)}:${geoObject.longitude.toFixed(6)}`;
}

export function SyncMarkersDialog({ open, onClose }: SyncMarkersDialogProps) {
  const { eligibleOverlays, isOnline, createGeoObject } = useGeoObjects();
  const { servers, callWithAuth } = useServers();

  const [sourceOverlayId, setSourceOverlayId] = useState('');
  const [sourceVersion, setSourceVersion] = useState('');
  const [targetOverlayId, setTargetOverlayId] = useState('');
  const [targetVersion, setTargetVersion] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // Versions known to exist for the currently selected source/target map:
  // the locally cached `overlay.mapVersion` plus the server's live
  // `currentVersion`, when they differ. Empty while undiscovered/unknown,
  // in which case the version field falls back to free-text entry.
  const [sourceVersions, setSourceVersions] = useState<string[]>([]);
  const [targetVersions, setTargetVersions] = useState<string[]>([]);
  const [sourceVersionsLoading, setSourceVersionsLoading] = useState(false);
  const [targetVersionsLoading, setTargetVersionsLoading] = useState(false);
  const versionRequestIdRef = useRef({ source: 0, target: 0 });

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceEntries, setSourceEntries] = useState<GeoObject[] | null>(null);
  const [targetExisting, setTargetExisting] = useState<GeoObject[] | null>(
    null,
  );

  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const sourceOverlay = eligibleOverlays.find((o) => o.id === sourceOverlayId);
  const targetOverlay = eligibleOverlays.find((o) => o.id === targetOverlayId);

  const clearPreview = () => {
    setSourceEntries(null);
    setTargetExisting(null);
    setLoadError(null);
    setSyncSummary(null);
  };

  // Looks up the server's full version history for this overlay's map and
  // unions in the locally cached `overlay.mapVersion` (e.g. a pinned version
  // not yet reflected there), so the caller can offer a choice instead of
  // requiring the version to be typed in blind.
  const discoverVersions = async (
    overlay: Overlay | undefined,
    side: 'source' | 'target',
    setVersions: (versions: string[]) => void,
    setLoading: (loading: boolean) => void,
    setVersionValue: (version: string) => void,
  ) => {
    setVersions([]);
    if (!overlay || !overlay.serverId || !overlay.mapId || !isOnline) {
      return;
    }
    const server = servers.find((s) => s.id === overlay.serverId);
    if (!server) {
      return;
    }
    const mapId = overlay.mapId;
    const requestId = ++versionRequestIdRef.current[side];
    setLoading(true);
    try {
      const serverVersions = await callWithAuth(server.id, (t) =>
        listMapVersions(server.baseUrl, mapId, t),
      );
      if (versionRequestIdRef.current[side] !== requestId) {
        return;
      }
      const versions = Array.from(
        new Set(
          [...serverVersions.map((v) => v.version), overlay.mapVersion].filter(
            (v): v is string => Boolean(v),
          ),
        ),
      ).sort(compareVersionsDesc);
      setVersions(versions);
      if (versions.length > 0) {
        setVersionValue(versions[0]);
      }
    } catch {
      // Live lookup failed (offline, expired session, etc.) - leave the
      // version field as free text so the user can still type one in.
    } finally {
      if (versionRequestIdRef.current[side] === requestId) {
        setLoading(false);
      }
    }
  };

  const handleSourceOverlayChange = (event: SelectChangeEvent) => {
    const id = event.target.value;
    setSourceOverlayId(id);
    const overlay = eligibleOverlays.find((o) => o.id === id);
    setSourceVersion(overlay?.mapVersion ?? '');
    clearPreview();
    void discoverVersions(
      overlay,
      'source',
      setSourceVersions,
      setSourceVersionsLoading,
      setSourceVersion,
    );
  };

  const handleTargetOverlayChange = (event: SelectChangeEvent) => {
    const id = event.target.value;
    setTargetOverlayId(id);
    const overlay = eligibleOverlays.find((o) => o.id === id);
    setTargetVersion(overlay?.mapVersion ?? '');
    clearPreview();
    void discoverVersions(
      overlay,
      'target',
      setTargetVersions,
      setTargetVersionsLoading,
      setTargetVersion,
    );
  };

  const sameSourceAndTarget =
    sourceOverlayId !== '' &&
    sourceOverlayId === targetOverlayId &&
    sourceVersion.trim() === targetVersion.trim();

  const canLoad =
    Boolean(sourceOverlayId) &&
    Boolean(targetOverlayId) &&
    Boolean(sourceVersion.trim()) &&
    Boolean(targetVersion.trim()) &&
    !sameSourceAndTarget &&
    isOnline &&
    !loading;

  const handleLoad = async () => {
    if (!sourceOverlay || !targetOverlay) {
      return;
    }
    const srcVersion = sourceVersion.trim();
    const tgtVersion = targetVersion.trim();
    const sourceServer = servers.find((s) => s.id === sourceOverlay.serverId);
    const targetServer = servers.find((s) => s.id === targetOverlay.serverId);
    if (!sourceServer || !targetServer) {
      setLoadError('One of the selected maps is no longer connected.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    setSyncSummary(null);
    try {
      const source = await callWithAuth(sourceServer.id, (t) =>
        listGeoObjects(
          sourceServer.baseUrl,
          sourceOverlay.mapId!,
          srcVersion,
          t,
        ),
      );
      setSourceEntries(source);
      if (skipDuplicates) {
        const target = await callWithAuth(targetServer.id, (t) =>
          listGeoObjects(
            targetServer.baseUrl,
            targetOverlay.mapId!,
            tgtVersion,
            t,
          ),
        );
        setTargetExisting(target);
      } else {
        setTargetExisting(null);
      }
    } catch (err) {
      setLoadError(describeGeoObjectError(err));
      setSourceEntries(null);
      setTargetExisting(null);
    } finally {
      setLoading(false);
    }
  };

  const toSync = useMemo(() => {
    if (!sourceEntries) {
      return null;
    }
    if (!skipDuplicates || !targetExisting) {
      return sourceEntries;
    }
    const existingKeys = new Set(targetExisting.map(dedupeKey));
    return sourceEntries.filter((g) => !existingKeys.has(dedupeKey(g)));
  }, [sourceEntries, skipDuplicates, targetExisting]);

  const duplicateCount =
    sourceEntries && toSync ? sourceEntries.length - toSync.length : 0;

  const handleSync = async () => {
    if (!toSync || toSync.length === 0 || !targetOverlay) {
      return;
    }
    const tgtVersion = targetVersion.trim();
    const targetIsLiveVersion = tgtVersion === targetOverlay.mapVersion;
    const targetServer = servers.find((s) => s.id === targetOverlay.serverId);

    setSyncing(true);
    setSyncSummary(null);
    let succeeded = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (const geoObject of toSync) {
      const req = toRequestFromGeoObject(geoObject);
      try {
        if (targetIsLiveVersion) {
          // Go through the context so the app's live marker list/cache for
          // this overlay picks up the new markers immediately.
          await createGeoObject(targetOverlay.id, req);
        } else if (targetServer) {
          await callWithAuth(targetServer.id, (t) =>
            apiCreateGeoObject(
              targetServer.baseUrl,
              targetOverlay.mapId!,
              tgtVersion,
              t,
              req,
            ),
          );
        } else {
          throw new Error('Target map is no longer connected.');
        }
        succeeded += 1;
      } catch (err) {
        failed += 1;
        if (!firstError) {
          firstError = describeGeoObjectError(err);
        }
      }
    }
    setSyncing(false);
    if (failed === 0) {
      onClose();
    } else {
      setSyncSummary(
        `${succeeded} marker${succeeded === 1 ? '' : 's'} synced, ${failed} failed${
          firstError ? `: ${firstError}` : ''
        }.`,
      );
    }
  };

  const renderMapVersionFields = (
    label: string,
    overlayId: string,
    onOverlayChange: (event: SelectChangeEvent) => void,
    version: string,
    onVersionChange: (version: string) => void,
    availableVersions: string[],
    versionsLoading: boolean,
  ) => (
    <Stack spacing={1.5} sx={{ flex: 1 }}>
      <Typography variant="subtitle2">{label}</Typography>
      <FormControl
        size="small"
        fullWidth
        disabled={eligibleOverlays.length === 0}
      >
        <InputLabel id={`sync-${label}-map-label`}>Map</InputLabel>
        <Select
          labelId={`sync-${label}-map-label`}
          label="Map"
          value={overlayId}
          onChange={onOverlayChange}
        >
          {eligibleOverlays.map((overlay: Overlay) => (
            <MenuItem key={overlay.id} value={overlay.id}>
              {overlay.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {availableVersions.length > 1 ? (
        <FormControl size="small" fullWidth>
          <InputLabel id={`sync-${label}-version-label`}>Version</InputLabel>
          <Select
            labelId={`sync-${label}-version-label`}
            label="Version"
            value={availableVersions.includes(version) ? version : ''}
            onChange={(event) => {
              onVersionChange(event.target.value);
              clearPreview();
            }}
          >
            {availableVersions.map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <TextField
          label="Version"
          size="small"
          fullWidth
          value={version}
          onChange={(event) => {
            onVersionChange(event.target.value);
            clearPreview();
          }}
          slotProps={{
            input: {
              endAdornment: versionsLoading ? (
                <CircularProgress size={14} />
              ) : undefined,
            },
          }}
        />
      )}
    </Stack>
  );

  const handleDialogClose = () => {
    if (syncing || loading) {
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="sm">
      <DialogTitle>Sync markers</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Copy markers from one map/version into another - useful when a map's
            version changed and its markers stopped showing.
          </Typography>
          {eligibleOverlays.length === 0 ? (
            <Alert severity="info">
              Enable a connected server map before syncing markers.
            </Alert>
          ) : !isOnline ? (
            <Alert severity="warning">
              You&apos;re offline - syncing requires a connection.
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {renderMapVersionFields(
              'From',
              sourceOverlayId,
              handleSourceOverlayChange,
              sourceVersion,
              setSourceVersion,
              sourceVersions,
              sourceVersionsLoading,
            )}
            {renderMapVersionFields(
              'To',
              targetOverlayId,
              handleTargetOverlayChange,
              targetVersion,
              setTargetVersion,
              targetVersions,
              targetVersionsLoading,
            )}
          </Stack>

          {sameSourceAndTarget ? (
            <Alert severity="warning">
              Source and target are the same map and version.
            </Alert>
          ) : null}

          <FormControlLabel
            control={
              <Checkbox
                checked={skipDuplicates}
                onChange={(event) => {
                  setSkipDuplicates(event.target.checked);
                  clearPreview();
                }}
              />
            }
            label={
              <Typography variant="body2">
                Skip markers that already exist in the target (matched by
                external ID, or by name + coordinates)
              </Typography>
            }
          />

          <Divider />

          <Button
            variant="outlined"
            onClick={handleLoad}
            disabled={!canLoad}
            startIcon={loading ? <CircularProgress size={14} /> : undefined}
            sx={{ alignSelf: 'flex-start' }}
          >
            Load markers
          </Button>

          {loadError ? <Alert severity="error">{loadError}</Alert> : null}

          {sourceEntries && toSync ? (
            <Alert severity={toSync.length > 0 ? 'success' : 'warning'}>
              {sourceEntries.length} marker
              {sourceEntries.length === 1 ? '' : 's'} found
              {duplicateCount > 0
                ? `, ${duplicateCount} already in target and will be skipped`
                : ''}
              . {toSync.length} will be synced.
            </Alert>
          ) : null}

          {syncSummary ? <Alert severity="warning">{syncSummary}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDialogClose} disabled={syncing || loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSync}
          disabled={!toSync || toSync.length === 0 || !isOnline || syncing}
          startIcon={syncing ? <CircularProgress size={14} /> : undefined}
        >
          Sync
        </Button>
      </DialogActions>
    </Dialog>
  );
}
