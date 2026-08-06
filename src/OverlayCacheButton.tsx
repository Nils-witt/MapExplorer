import { useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DownloadDoneIcon from '@mui/icons-material/DownloadDone';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';
import type { Overlay } from './types';
import type { ServerConnection } from './storage';
import { cacheOverlayTiles, isTileCacheSupported } from './tileCache';

type CacheState =
  | { status: 'caching'; done: number; total: number }
  | { status: 'done'; cached: number; total: number }
  | { status: 'error' };

interface OverlayCacheButtonProps {
  overlay: Overlay;
  servers: ServerConnection[];
}

// Downloads every tile listed in the server's manifest for this overlay into
// a cache dedicated to the overlay's id and tile source, so it's available
// offline independently of the shared runtime tile cache's eviction limits.
export function OverlayCacheButton({
  overlay,
  servers,
}: OverlayCacheButtonProps) {
  const [state, setState] = useState<CacheState | null>(null);

  if (!isTileCacheSupported()) {
    return null;
  }

  const handleClick = async () => {
    setState({ status: 'caching', done: 0, total: 0 });
    try {
      const result = await cacheOverlayTiles(overlay, servers, (done, total) =>
        setState({ status: 'caching', done, total }),
      );
      setState(
        result.total > 0 && result.cached === 0
          ? { status: 'error' }
          : { status: 'done', cached: result.cached, total: result.total },
      );
    } catch {
      setState({ status: 'error' });
    }
  };

  const tooltip =
    state?.status === 'caching'
      ? `Caching tiles… (${state.done}/${state.total || '?'})`
      : state?.status === 'done'
        ? `Cached ${state.cached}/${state.total} tiles for offline use`
        : state?.status === 'error'
          ? 'Failed to cache tiles - tap to retry'
          : 'Cache all tiles for this overlay for offline use';

  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          edge="end"
          aria-label={`Cache ${overlay.name} for offline use`}
          disabled={state?.status === 'caching'}
          onClick={handleClick}
        >
          {state?.status === 'caching' ? (
            <CircularProgress size={16} />
          ) : state?.status === 'done' ? (
            <DownloadDoneIcon fontSize="small" color="success" />
          ) : state?.status === 'error' ? (
            <DownloadForOfflineIcon fontSize="small" color="error" />
          ) : (
            <DownloadForOfflineIcon fontSize="small" />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
