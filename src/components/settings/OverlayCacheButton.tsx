import { useEffect, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DownloadDoneIcon from '@mui/icons-material/DownloadDone';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';
import type { OverlayMap } from '../../api/OverlayServer.ts';
import type { ConnectedServer } from '../../types.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  cacheOverlayTiles,
  isOverlayCached,
  isTileCacheSupported,
} from '../../lib/tileCache.ts';

type CacheState =
  | { status: 'caching'; done: number; total: number }
  | { status: 'done'; cached?: number; total?: number }
  | { status: 'error' };

interface OverlayCacheButtonProps {
  server: ConnectedServer;
  overlay: OverlayMap;
  version: string;
}

// Downloads every tile of an overlay version for offline use, into the cache
// named `<server id>-<map uuid>-<version>`.
export default function OverlayCacheButton({
  server,
  overlay,
  version,
}: OverlayCacheButtonProps) {
  const { accessToken } = useAuth();
  // Keyed by version so switching versions resets the state.
  const [state, setState] = useState<{
    version: string;
    value: CacheState;
  } | null>(null);
  const current = state?.version === version ? state.value : null;

  useEffect(() => {
    if (!isTileCacheSupported()) {
      return;
    }
    let cancelled = false;
    void isOverlayCached(overlay.uuid, version).then((cached) => {
      if (!cancelled && cached) {
        // Don't clobber a caching run started in the meantime.
        setState((prev) =>
          prev?.version === version
            ? prev
            : { version, value: { status: 'done' } },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [server.id, overlay.uuid, version]);

  if (!isTileCacheSupported()) {
    return null;
  }

  const handleClick = async () => {
    const update = (value: CacheState) => setState({ version, value });
    update({ status: 'caching', done: 0, total: 0 });
    try {
      const result = await cacheOverlayTiles(
        server.baseUrl,
        accessToken,
        overlay.uuid,
        version,
        (done, total) => update({ status: 'caching', done, total }),
      );
      update(
        result.total > 0 && result.cached === 0
          ? { status: 'error' }
          : { status: 'done', cached: result.cached, total: result.total },
      );
    } catch (error) {
      console.error(`Failed to cache overlay ${overlay.name}:`, error);
      update({ status: 'error' });
    }
  };

  const tooltip =
    current?.status === 'caching'
      ? `Caching tiles… (${current.done}/${current.total || '?'})`
      : current?.status === 'done'
        ? current.total !== undefined
          ? `Cached ${current.cached}/${current.total} tiles of v${version}`
          : `v${version} is cached - click to refresh`
        : current?.status === 'error'
          ? 'Failed to cache tiles - click to retry'
          : `Cache v${version} for offline use`;

  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          size="small"
          aria-label={`Cache ${overlay.name} for offline use`}
          disabled={current?.status === 'caching'}
          onClick={handleClick}
          sx={{ flexShrink: 0 }}
        >
          {current?.status === 'caching' ? (
            <CircularProgress
              size={16}
              variant={current.total ? 'determinate' : 'indeterminate'}
              value={current.total ? (current.done / current.total) * 100 : 0}
            />
          ) : current?.status === 'done' ? (
            <DownloadDoneIcon fontSize="small" color="success" />
          ) : (
            <DownloadForOfflineIcon
              fontSize="small"
              color={current?.status === 'error' ? 'error' : undefined}
            />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
