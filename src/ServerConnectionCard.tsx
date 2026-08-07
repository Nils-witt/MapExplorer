import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import type { ServerConnection } from './storage';
import type { ServerMap } from './serverApi';
import { useOverlays } from './OverlaysContext';
import {
  DEFAULT_SERVER_BASE_URL,
  login,
  listMaps,
  overlayIdForMap,
  refreshAccessToken,
  tileUrlForMap,
  ServerApiError,
} from './serverApi';

interface ServerConnectionCardProps {
  connection: ServerConnection;
  onChange: (patch: Partial<ServerConnection>) => void;
  onRemove: () => void;
}

export function ServerConnectionCard({
  connection,
  onChange,
  onRemove,
}: ServerConnectionCardProps) {
  const {
    overlays,
    addOverlay: onAddOverlay,
    editOverlay: onEditOverlay,
    removeOverlay: onRemoveOverlay,
    refreshServerOverlays,
  } = useOverlays();
  const [serverUrl, setServerUrl] = useState(connection.baseUrl);
  const [username, setUsername] = useState(connection.username);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(connection.token);
  const [refreshToken, setRefreshToken] = useState(connection.refreshToken);
  const [maps, setMaps] = useState<ServerMap[] | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors of the token state, readable synchronously right after a write.
  // State setters don't apply until the next render, but callWithAuth needs
  // the value it just refreshed within the same call.
  const tokenRef = useRef(token);
  const refreshTokenRef = useRef(refreshToken);

  // The refresh token is single-use: redeeming it invalidates it, so two
  // concurrent 401s (e.g. overlapping requests, or React re-running an
  // effect) must not each call refreshAccessToken - the second would use
  // the now-stale token, fail, and clear out the session the first just
  // refreshed. This dedupes concurrent refreshes into a single in-flight
  // call that every caller awaits.
  const refreshInFlightRef = useRef<Promise<{
    token: string;
    refreshToken: string;
  }> | null>(null);

  const applyTokens = (newToken: string, newRefreshToken: string) => {
    tokenRef.current = newToken;
    refreshTokenRef.current = newRefreshToken;
    setToken(newToken);
    setRefreshToken(newRefreshToken);
    onChange({ token: newToken, refreshToken: newRefreshToken });
    // Shown overlays resolve their auth header live, but MapLibre won't
    // retry tiles it already fetched with the old token - cycle the source
    // so it re-fetches under the new one.
    refreshServerOverlays(connection.id);
  };

  const clearSession = () => {
    tokenRef.current = '';
    refreshTokenRef.current = '';
    setToken('');
    setRefreshToken('');
    setMaps(null);
    onChange({ token: '', refreshToken: '' });
  };

  // Runs `call` with the current token; if the token turned out to be
  // expired, redeems the (single-use) refresh token for a new pair and
  // retries once before giving up and forcing a full re-login.
  const callWithAuth = async <T,>(
    call: (activeToken: string) => Promise<T>,
  ): Promise<T> => {
    try {
      return await call(tokenRef.current);
    } catch (err) {
      if (!(err instanceof ServerApiError) || err.status !== 401) {
        throw err;
      }
      if (!refreshTokenRef.current) {
        clearSession();
        throw err;
      }
      let refreshed;
      try {
        if (!refreshInFlightRef.current) {
          refreshInFlightRef.current = refreshAccessToken(
            serverUrl,
            refreshTokenRef.current,
          )
            .then((result) => {
              // Applied once here, inside the shared in-flight call, so
              // concurrent callers don't each re-apply the same tokens.
              applyTokens(result.token, result.refreshToken);
              return result;
            })
            .finally(() => {
              refreshInFlightRef.current = null;
            });
        }
        refreshed = await refreshInFlightRef.current;
      } catch {
        clearSession();
        throw err;
      }
      return call(refreshed.token);
    }
  };

  const fetchMaps = async () => {
    setLoadingMaps(true);
    setError(null);
    try {
      setMaps(await callWithAuth((t) => listMaps(serverUrl, t)));
    } catch (err) {
      if (err instanceof ServerApiError) {
        setError(
          err.status === 401
            ? 'Session expired. Please sign in again.'
            : err.message,
        );
      } else {
        setError('Failed to load maps from server.');
      }
      setMaps(null);
    } finally {
      setLoadingMaps(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchMaps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedUrl = serverUrl.trim();
    setSigningIn(true);
    setError(null);
    try {
      const tokens = await login(trimmedUrl, username.trim(), password);
      setServerUrl(trimmedUrl);
      setPassword('');
      onChange({ baseUrl: trimmedUrl, username: username.trim() });
      applyTokens(tokens.token, tokens.refreshToken);
      await fetchMaps();
    } catch (err) {
      if (err instanceof ServerApiError) {
        setError(err.message);
      } else {
        setError('Sign in failed.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    clearSession();
    setError(null);
  };

  const handleToggleMap = (map: ServerMap) => {
    const overlayId = overlayIdForMap(map);
    const existing = overlays.find((overlay) => overlay.id === overlayId);
    if (existing) {
      onRemoveOverlay(overlayId);
      return;
    }
    // Save the relation to this server instead of freezing the current
    // token - the authorization header is resolved live from the server's
    // token on every tile request, so it never goes stale.
    onAddOverlay(
      map.name,
      tileUrlForMap(serverUrl, map),
      undefined,
      connection.id,
      overlayId,
    );
  };

  const handleResync = (map: ServerMap) => {
    onEditOverlay(
      overlayIdForMap(map),
      map.name,
      tileUrlForMap(serverUrl, map),
      undefined,
      connection.id,
    );
  };

  // Out of sync covers overlays added before server-linking existed (no
  // `serverId` yet) and maps whose tile URL changed (e.g. a version bump) -
  // the token itself can no longer go stale since it's resolved live.
  const outOfSyncMaps = (maps ?? []).filter((map) => {
    const existing = overlays.find(
      (overlay) => overlay.id === overlayIdForMap(map),
    );
    return (
      existing !== undefined &&
      (existing.serverId !== connection.id ||
        existing.tiles[0] !== tileUrlForMap(serverUrl, map))
    );
  });

  const handleResyncAll = () => {
    outOfSyncMaps.forEach(handleResync);
  };

  if (!token) {
    return (
      <Stack
        component="form"
        spacing={1.5}
        onSubmit={handleSignIn}
        sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography variant="body2" color="text.secondary">
            Sign in to load maps from an overlay server.
          </Typography>
          <Tooltip title="Remove server">
            <IconButton
              size="small"
              onClick={onRemove}
              aria-label="Remove server"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TextField
          label="Server URL"
          type="url"
          size="small"
          fullWidth
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder={DEFAULT_SERVER_BASE_URL}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            label="Username"
            size="small"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            size="small"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Stack>
        <Button
          type="submit"
          variant="outlined"
          size="small"
          disabled={
            !serverUrl.trim() || !username.trim() || !password || signingIn
          }
          sx={{ alignSelf: 'flex-start' }}
        >
          {signingIn ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack
      spacing={1.5}
      sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="body2" color="text.secondary">
          Signed in as {username} on {serverUrl}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          {outOfSyncMaps.length > 0 ? (
            <Tooltip title="Relink these overlays to this server so their tiles and token stay in sync">
              <Button
                size="small"
                variant="outlined"
                startIcon={<SyncIcon fontSize="small" />}
                onClick={handleResyncAll}
              >
                Resync ({outOfSyncMaps.length})
              </Button>
            </Tooltip>
          ) : null}
          <Tooltip title="Refresh map list">
            <span>
              <IconButton
                size="small"
                onClick={() => fetchMaps()}
                disabled={loadingMaps}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Sign out">
            <IconButton size="small" onClick={handleSignOut}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove server">
            <IconButton
              size="small"
              onClick={onRemove}
              aria-label="Remove server"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loadingMaps ? (
        <Stack sx={{ alignItems: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : maps && maps.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No maps available on the server.
        </Typography>
      ) : maps ? (
        <List dense disablePadding>
          {maps.map((map) => {
            const overlayId = overlayIdForMap(map);
            const existing = overlays.find(
              (overlay) => overlay.id === overlayId,
            );
            const outOfSync =
              existing !== undefined &&
              (existing.serverId !== connection.id ||
                existing.tiles[0] !== tileUrlForMap(serverUrl, map));
            return (
              <ListItem
                key={map.uuid}
                disablePadding
                sx={{ pr: outOfSync ? 5 : 0 }}
                secondaryAction={
                  outOfSync ? (
                    <Tooltip title="Relink this overlay to this server">
                      <IconButton
                        edge="end"
                        aria-label={`Resync ${map.name}`}
                        onClick={() => handleResync(map)}
                      >
                        <SyncIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : undefined
                }
              >
                <ListItemButton dense onClick={() => handleToggleMap(map)}>
                  <ListItemIcon sx={{ minWidth: 0 }}>
                    <Checkbox
                      edge="start"
                      tabIndex={-1}
                      disableRipple
                      checked={existing !== undefined}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={map.name}
                    secondary={`version ${map.currentVersion}`}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      ) : null}
    </Stack>
  );
}
