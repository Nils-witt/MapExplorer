import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import type { Overlay } from './types';
import type { ServerMap } from './serverApi';
import {
  DEFAULT_SERVER_BASE_URL,
  login,
  listMaps,
  overlayIdForMap,
  tileUrlForMap,
  ServerApiError,
} from './serverApi';
import {
  loadServerBaseUrl,
  loadServerToken,
  loadServerUsername,
  saveServerBaseUrl,
  saveServerToken,
  saveServerUsername,
} from './storage';

interface ServerMapsSectionProps {
  overlays: Overlay[];
  onAddOverlay: (
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
  ) => void;
  onEditOverlay: (
    id: string,
    name: string,
    tilesUrl: string,
    authorizationHeader?: string,
  ) => void;
  onRemoveOverlay: (id: string) => void;
}

export function ServerMapsSection({
  overlays,
  onAddOverlay,
  onEditOverlay,
  onRemoveOverlay,
}: ServerMapsSectionProps) {
  const [serverUrl, setServerUrl] = useState(() =>
    loadServerBaseUrl(DEFAULT_SERVER_BASE_URL),
  );
  const [username, setUsername] = useState(loadServerUsername);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(loadServerToken);
  const [maps, setMaps] = useState<ServerMap[] | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMaps = async (activeToken: string) => {
    setLoadingMaps(true);
    setError(null);
    try {
      setMaps(await listMaps(serverUrl, activeToken));
    } catch (err) {
      if (err instanceof ServerApiError) {
        setError(err.message);
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
      fetchMaps(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedUrl = serverUrl.trim();
    setSigningIn(true);
    setError(null);
    try {
      const newToken = await login(trimmedUrl, username.trim(), password);
      setServerUrl(trimmedUrl);
      setToken(newToken);
      setPassword('');
      saveServerBaseUrl(trimmedUrl);
      saveServerUsername(username.trim());
      saveServerToken(newToken);
      await fetchMaps(newToken);
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
    setToken('');
    setMaps(null);
    setError(null);
    saveServerToken('');
  };

  const handleToggleMap = (map: ServerMap) => {
    const overlayId = overlayIdForMap(map);
    const existing = overlays.find((overlay) => overlay.id === overlayId);
    if (existing) {
      onRemoveOverlay(overlayId);
      return;
    }
    onAddOverlay(map.name, tileUrlForMap(serverUrl, map), `Bearer ${token}`);
  };

  const handleResync = (map: ServerMap) => {
    onEditOverlay(
      overlayIdForMap(map),
      map.name,
      tileUrlForMap(serverUrl, map),
      `Bearer ${token}`,
    );
  };

  if (!token) {
    return (
      <Stack component="form" spacing={1.5} onSubmit={handleSignIn}>
        <Typography variant="subtitle1">Server maps</Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in to load maps from an overlay server.
        </Typography>
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
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="subtitle1">Server maps</Typography>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Refresh map list">
            <span>
              <IconButton
                size="small"
                onClick={() => fetchMaps(token)}
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
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Signed in as {username} on {serverUrl}
      </Typography>
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
              existing.authorizationHeader !== `Bearer ${token}`;
            return (
              <ListItem
                key={map.uuid}
                disablePadding
                sx={{ pr: outOfSync ? 5 : 0 }}
                secondaryAction={
                  outOfSync ? (
                    <Tooltip title="Refresh access token for this overlay">
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
