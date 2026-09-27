import { useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import Stack from '@mui/material/Stack';
import { useConnectedServers } from '../../context/ConnectedServersContext.tsx';
import {
  type UnitServerStatus,
  useUnits,
} from '../../context/UnitsContext.tsx';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  CONFIGURED_OVERLAY_SERVER_ID,
  CONFIGURED_UNIT_SERVER_ID,
} from '../../lib/config.ts';
import { type ConnectedServer, isServerEnabled } from '../../types.ts';

// Sets whether one server of a list is enabled.
function setEnabled(
  setServers: Dispatch<SetStateAction<ConnectedServer[]>>,
  serverId: string,
  enabled: boolean,
) {
  setServers((prev) =>
    prev.map((server) =>
      server.id === serverId ? { ...server, enabled } : server,
    ),
  );
}

export default function ConnectedServersSettings() {
  const { overlayServers, unitServers, setOverlayServers, setUnitServers } =
    useConnectedServers();
  const { units, status } = useUnits();

  return (
    <Stack spacing={1.5}>
      <Typography variant="overline" color="text.secondary">
        Overlay servers
      </Typography>
      {overlayServers.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No overlay servers yet. Add a tileserve-go server to use its maps as
          overlays.
        </Typography>
      )}
      {overlayServers.map((server) => (
        <Paper key={server.id} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6">{server.name}</Typography>
              <Typography variant="subtitle1" sx={{ wordBreak: 'break-all' }}>
                {server.baseUrl}
              </Typography>
            </Stack>
            <EnableServerSwitch
              server={server}
              onChange={(enabled) =>
                setEnabled(setOverlayServers, server.id, enabled)
              }
            />
            <RemoveServerButton
              server={server}
              configuredId={CONFIGURED_OVERLAY_SERVER_ID}
              onRemove={() =>
                setOverlayServers((prev) =>
                  prev.filter((other) => other.id !== server.id),
                )
              }
            />
          </Stack>
        </Paper>
      ))}
      <AddServerForm
        title="Add overlay server"
        placeholder="https://tiles.example.com"
        helperText="The server must allow this app in its CORS settings."
        onAdd={(name, baseUrl) =>
          setOverlayServers((prev) => [
            ...prev,
            { id: crypto.randomUUID(), name, baseUrl },
          ])
        }
      />

      <Typography variant="overline" color="text.secondary">
        Unit servers
      </Typography>
      {unitServers.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No unit servers yet. Add a go-unit-mangement server to show its units
          on the map.
        </Typography>
      )}
      {unitServers.map((server) => (
        <Paper key={server.id} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h6">{server.name}</Typography>
              <Typography variant="subtitle1" sx={{ wordBreak: 'break-all' }}>
                {server.baseUrl}
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', mt: 0.5 }}
              >
                <StatusChip status={status[server.id]} />
                <Typography variant="body2" color="text.secondary">
                  {countUnits(units[server.id])}
                </Typography>
              </Stack>
            </Stack>
            <EnableServerSwitch
              server={server}
              onChange={(enabled) =>
                setEnabled(setUnitServers, server.id, enabled)
              }
            />
            <RemoveServerButton
              server={server}
              configuredId={CONFIGURED_UNIT_SERVER_ID}
              onRemove={() =>
                setUnitServers((prev) =>
                  prev.filter((other) => other.id !== server.id),
                )
              }
            />
          </Stack>
        </Paper>
      ))}
      <AddServerForm
        title="Add unit server"
        placeholder="https://units.example.com"
        helperText="The server must allow this app in CORS_ALLOWED_ORIGINS and accept its sign-in tokens."
        onAdd={(name, baseUrl) =>
          setUnitServers((prev) => [
            ...prev,
            { id: crypto.randomUUID(), name, baseUrl },
          ])
        }
      />
    </Stack>
  );
}

function countUnits(serverUnits: Record<string, unknown> | undefined): string {
  if (!serverUnits) {
    return '';
  }
  const count = Object.keys(serverUnits).length;
  return `${count} unit${count === 1 ? '' : 's'}`;
}

function StatusChip({ status }: { status: UnitServerStatus | undefined }) {
  switch (status?.state) {
    case 'live':
      return <Chip size="small" color="success" label="Live" />;
    case 'offline':
      return (
        <Chip
          size="small"
          color="error"
          label={`Offline: ${status.error}`}
          title="Retrying automatically"
        />
      );
    case 'disabled':
      return <Chip size="small" label="Disabled" />;
    case 'signedOut':
      return <Chip size="small" label="Sign in to connect" />;
    default:
      return <Chip size="small" label="Connecting…" />;
  }
}

function EnableServerSwitch({
  server,
  onChange,
}: {
  server: ConnectedServer;
  onChange: (enabled: boolean) => void;
}) {
  const enabled = isServerEnabled(server);
  return (
    <Switch
      checked={enabled}
      onChange={(event) => onChange(event.target.checked)}
      slotProps={{
        input: {
          'aria-label': `${enabled ? 'Disable' : 'Enable'} ${server.name}`,
        },
      }}
    />
  );
}

function RemoveServerButton({
  server,
  configuredId,
  onRemove,
}: {
  server: ConnectedServer;
  // Id of the server the app configuration sets for this list.
  configuredId: string;
  onRemove: () => void;
}) {
  // The configured server would come back with the next start.
  const configured = server.id === configuredId;
  return (
    <IconButton
      aria-label={`Remove ${server.name}`}
      disabled={configured}
      title={configured ? 'Set by the app configuration' : undefined}
      onClick={onRemove}
    >
      <DeleteIcon />
    </IconButton>
  );
}

function AddServerForm({
  title,
  placeholder,
  helperText,
  onAdd,
}: {
  title: string;
  placeholder: string;
  helperText: string;
  onAdd: (name: string, baseUrl: string) => void;
}) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    let url: URL;
    try {
      url = new URL(baseUrl.trim());
    } catch {
      setError(`Enter a URL like ${placeholder}`);
      return;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      setError('The URL must start with https:// or http://');
      return;
    }
    const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
    onAdd(name.trim() || url.host, normalized);
    setName('');
    setBaseUrl('');
    setError(null);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={1.5} onSubmit={handleSubmit}>
        <Typography variant="subtitle2">{title}</Typography>
        <TextField
          size="small"
          label="Base URL"
          placeholder={placeholder}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          error={error !== null}
          helperText={error ?? helperText}
          required
        />
        <TextField
          size="small"
          label="Name"
          placeholder="Defaults to the host"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" variant="contained" sx={{ alignSelf: 'end' }}>
          Add
        </Button>
      </Stack>
    </Paper>
  );
}
