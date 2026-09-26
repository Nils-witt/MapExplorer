import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useOverlays } from '../../context/OverlaysContext.tsx';
import {
  type CacheInfo,
  deleteAllCaches,
  isTileCacheSupported,
  listCaches,
  parseOverlayCacheName,
} from '../../lib/tileCache.ts';

const isServiceWorkerSupported = () => 'serviceWorker' in navigator;

// The app's own precache, needed to start offline.
const isPrecache = (name: string) => name.startsWith('workbox-precache');

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

interface StorageInfo {
  usage?: number;
  quota?: number;
  persisted: boolean;
}

type Confirm = 'unregister' | 'deleteAll';

export default function ServiceWorkerSettings() {
  const { overlays } = useOverlays();
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | null | undefined
  >(isServiceWorkerSupported() ? undefined : null);
  const [cacheList, setCacheList] = useState<CacheInfo[] | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Kept after closing so the dialog text doesn't change while it fades out.
  const [confirm, setConfirm] = useState<Confirm>('deleteAll');
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Bumped whenever the service worker's state changes, since the
  // registration object is mutated in place and wouldn't rerender.
  const [, setSwGeneration] = useState(0);

  const overlayNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const serverOverlays of Object.values(overlays)) {
      for (const overlay of serverOverlays) {
        names.set(overlay.uuid, overlay.name);
      }
    }
    return names;
  }, [overlays]);

  const refresh = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    if (isServiceWorkerSupported()) {
      tasks.push(
        navigator.serviceWorker
          .getRegistration()
          .then((reg) => setRegistration(reg ?? null)),
      );
    }
    if (isTileCacheSupported()) {
      tasks.push(
        listCaches().then((list) =>
          setCacheList(list.sort((a, b) => a.name.localeCompare(b.name))),
        ),
      );
    }
    if (navigator.storage?.estimate) {
      tasks.push(
        Promise.all([
          navigator.storage.estimate(),
          navigator.storage.persisted?.() ?? Promise.resolve(false),
        ]).then(([estimate, persisted]) =>
          setStorage({
            usage: estimate.usage,
            quota: estimate.quota,
            persisted,
          }),
        ),
      );
    }
    try {
      await Promise.all(tasks);
    } catch (error) {
      console.error('Failed to read service worker/cache state:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Track installs and activations so the status stays current.
  useEffect(() => {
    if (!registration) {
      return;
    }
    const bump = () => setSwGeneration((prev) => prev + 1);
    const workers = [
      registration.installing,
      registration.waiting,
      registration.active,
    ].filter((worker): worker is ServiceWorker => worker !== null);
    const onUpdateFound = () => {
      registration.installing?.addEventListener('statechange', bump);
      bump();
    };
    workers.forEach((worker) => worker.addEventListener('statechange', bump));
    registration.addEventListener('updatefound', onUpdateFound);
    navigator.serviceWorker.addEventListener('controllerchange', bump);
    return () => {
      workers.forEach((worker) =>
        worker.removeEventListener('statechange', bump),
      );
      registration.removeEventListener('updatefound', onUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', bump);
    };
  }, [registration]);

  const run = async (action: () => Promise<string | null>, failure: string) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
    } catch (error) {
      console.error(failure, error);
      setMessage(failure);
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      await refresh();
    }
  };

  const handleCheckForUpdate = () =>
    run(async () => {
      if (!registration) return null;
      await registration.update();
      return registration.installing || registration.waiting
        ? 'An update was found.'
        : 'No update available.';
    }, 'Failed to check for updates.');

  // The Workbox service worker skips waiting on this message; reload once it
  // has taken control so the page runs the new version.
  const handleActivateUpdate = () => {
    const waiting = registration?.waiting;
    if (!waiting) return;
    setBusy(true);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    );
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const handleUnregister = () =>
    run(async () => {
      if (!registration) return null;
      await registration.unregister();
      window.location.reload();
      return null;
    }, 'Failed to unregister the service worker.');

  const handleDeleteCache = (name: string) =>
    run(async () => {
      await caches.delete(name);
      return `Deleted ${name}.`;
    }, `Failed to delete ${name}.`);

  const handleDeleteAll = () =>
    run(async () => {
      const count = await deleteAllCaches();
      return `Deleted ${count} cache${count === 1 ? '' : 's'}.`;
    }, 'Failed to delete caches.');

  const handleRequestPersistence = () =>
    run(async () => {
      const granted = await navigator.storage.persist();
      return granted
        ? 'Storage is now persistent.'
        : 'The browser declined persistent storage.';
    }, 'Failed to request persistent storage.');

  const cacheLabel = (name: string) => {
    if (isPrecache(name)) return 'App files';
    const overlay = parseOverlayCacheName(name);
    if (overlay) {
      const overlayName = overlayNames.get(overlay.mapUuid);
      return `Overlay ${overlayName ?? overlay.mapUuid} v${overlay.version}`;
    }
    return name;
  };

  const swStatus = !isServiceWorkerSupported()
    ? { label: 'Not supported', color: 'default' as const }
    : registration === undefined
      ? { label: 'Loading…', color: 'default' as const }
      : registration === null
        ? { label: 'Not registered', color: 'warning' as const }
        : registration.waiting
          ? { label: 'Update waiting', color: 'info' as const }
          : registration.installing
            ? { label: 'Installing update', color: 'info' as const }
            : registration.active
              ? { label: 'Active', color: 'success' as const }
              : { label: 'Registered', color: 'default' as const };

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="overline" color="text.secondary">
          Service worker
        </Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Chip
                size="small"
                label={swStatus.label}
                color={swStatus.color}
              />
              {registration && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  Scope: {registration.scope}
                </Typography>
              )}
            </Stack>
            {registration && !navigator.serviceWorker.controller && (
              <Typography variant="body2" color="text.secondary">
                This page is not controlled by the service worker yet. Reload to
                enable offline support.
              </Typography>
            )}
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap', rowGap: 1 }}
            >
              <Button
                variant="outlined"
                size="small"
                disabled={!registration || busy}
                onClick={() => void handleCheckForUpdate()}
              >
                Check for update
              </Button>
              {registration?.waiting && (
                <Button
                  variant="contained"
                  size="small"
                  disabled={busy}
                  onClick={handleActivateUpdate}
                >
                  Update and reload
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                color="error"
                disabled={!registration || busy}
                onClick={() => {
                  setConfirm('unregister');
                  setConfirmOpen(true);
                }}
              >
                Unregister
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>

      {storage && (
        <Stack spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            Storage
          </Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              {storage.usage !== undefined && storage.quota !== undefined && (
                <>
                  <Typography variant="body2">
                    {formatBytes(storage.usage)} used of{' '}
                    {formatBytes(storage.quota)} available
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={
                      storage.quota ? (storage.usage / storage.quota) * 100 : 0
                    }
                  />
                </>
              )}
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Typography variant="body2" color="text.secondary">
                  {storage.persisted
                    ? 'Persistent: the browser will not evict cached data.'
                    : 'Best effort: the browser may evict cached data when space runs low.'}
                </Typography>
                {!storage.persisted && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void handleRequestPersistence()}
                    sx={{ flexShrink: 0 }}
                  >
                    Make persistent
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      )}

      {isTileCacheSupported() && (
        <Stack spacing={0.5}>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="overline" color="text.secondary">
              Caches
            </Typography>
            <Tooltip title="Refresh">
              <span>
                <IconButton
                  size="small"
                  aria-label="Refresh caches"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          {cacheList === null ? (
            <LinearProgress />
          ) : cacheList.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No caches.
            </Typography>
          ) : (
            <Paper variant="outlined">
              <List dense disablePadding>
                {cacheList.map((cache, index) => (
                  <ListItem
                    key={cache.name}
                    divider={index < cacheList.length - 1}
                    secondaryAction={
                      !isPrecache(cache.name) && (
                        <Tooltip title="Delete cache">
                          <span>
                            <IconButton
                              edge="end"
                              size="small"
                              aria-label={`Delete ${cache.name}`}
                              disabled={busy}
                              onClick={() => void handleDeleteCache(cache.name)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )
                    }
                  >
                    <ListItemText
                      primary={cacheLabel(cache.name)}
                      secondary={`${cache.entries} entr${cache.entries === 1 ? 'y' : 'ies'} · ${cache.name}`}
                      slotProps={{ secondary: { noWrap: true } }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Stack>
      )}

      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'flex-end' }}
      >
        {message && (
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
        )}
        {isTileCacheSupported() && (
          <Button
            color="error"
            variant="outlined"
            disabled={busy}
            onClick={() => {
              setConfirm('deleteAll');
              setConfirmOpen(true);
            }}
          >
            Delete all caches
          </Button>
        )}
      </Stack>

      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)}>
        <DialogTitle>
          {confirm === 'unregister'
            ? 'Unregister the service worker?'
            : 'Delete all caches?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm === 'unregister'
              ? 'The app reloads and installs the service worker afresh. Cached data is kept.'
              : 'Every overlay cached for offline use and all map tiles and styles cached while browsing will be deleted. They are downloaded again when next needed, which requires a connection.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            color="error"
            disabled={busy}
            onClick={() =>
              void (confirm === 'unregister'
                ? handleUnregister()
                : handleDeleteAll())
            }
          >
            {confirm === 'unregister' ? 'Unregister' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
