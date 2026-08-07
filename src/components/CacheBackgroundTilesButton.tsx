import { useState } from 'react';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DownloadForOfflineIcon from '@mui/icons-material/DownloadForOffline';
import type { Overlay } from '../types';
import type { ServerConnection } from '../lib/storage';
import { isTileCacheSupported } from '../lib/tileCache';
import {
  cacheStyleTiles,
  DEFAULT_CACHE_ZOOM_RANGE,
  overlaysBoundingBox,
} from '../lib/styleTileCache';

type CacheState =
  | { status: 'caching'; done: number; total: number }
  | { status: 'done'; cached: number; total: number }
  | { status: 'error'; message?: string };

interface CacheBackgroundTilesButtonProps {
  overlays: Overlay[];
  servers: ServerConnection[];
  styleUrl: string;
}

// Pre-caches the base map style's own tiles (not overlay tiles) for the
// geographic area the overlays cover, so the background map keeps
// rendering offline in the areas that matter without downloading the
// whole world.
export function CacheBackgroundTilesButton({
  overlays,
  servers,
  styleUrl,
}: CacheBackgroundTilesButtonProps) {
  const [state, setState] = useState<CacheState | null>(null);

  if (!isTileCacheSupported() || overlays.length === 0) {
    return null;
  }

  const { minZoom, maxZoom } = DEFAULT_CACHE_ZOOM_RANGE;

  const handleClick = async () => {
    setState({ status: 'caching', done: 0, total: 0 });
    try {
      const bounds = await overlaysBoundingBox(overlays, servers);
      if (!bounds) {
        setState({ status: 'error', message: 'No overlay area found' });
        return;
      }
      const result = await cacheStyleTiles(
        styleUrl,
        bounds,
        DEFAULT_CACHE_ZOOM_RANGE,
        (done, total) => setState({ status: 'caching', done, total }),
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

  const statusText =
    state?.status === 'caching'
      ? `Caching tiles… (${state.done}/${state.total || '?'})`
      : state?.status === 'done'
        ? `Cached ${state.cached}/${state.total} tiles for offline use`
        : state?.status === 'error'
          ? (state.message ?? 'Failed to cache tiles') + ' - tap to retry'
          : `Downloads zoom ${minZoom}–${maxZoom} of the map style covering the overlay area`;

  return (
    <Stack spacing={0.5}>
      <Button
        variant="outlined"
        size="small"
        color={state?.status === 'error' ? 'error' : 'primary'}
        disabled={state?.status === 'caching'}
        onClick={handleClick}
        startIcon={
          state?.status === 'caching' ? (
            <CircularProgress size={16} />
          ) : (
            <DownloadForOfflineIcon fontSize="small" />
          )
        }
        sx={{ alignSelf: 'flex-start' }}
      >
        {`Cache background map (zoom ${minZoom}–${maxZoom})`}
      </Button>
      <Typography variant="caption" color="text.secondary">
        {statusText}
      </Typography>
    </Stack>
  );
}
