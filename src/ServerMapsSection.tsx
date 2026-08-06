import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import type { Dispatch, SetStateAction } from 'react';
import { loadDefaultServerUrl } from './storage';
import type { ServerConnection } from './storage';
import { ServerConnectionCard } from './ServerConnectionCard';

interface ServerMapsSectionProps {
  servers: ServerConnection[];
  onServersChange: Dispatch<SetStateAction<ServerConnection[]>>;
}

function createConnection(baseUrl: string): ServerConnection {
  return {
    id: crypto.randomUUID(),
    baseUrl,
    username: '',
    token: '',
    refreshToken: '',
  };
}

export function ServerMapsSection({
  servers,
  onServersChange,
}: ServerMapsSectionProps) {
  const handleAddServer = () => {
    onServersChange((prev) => [
      ...prev,
      createConnection(prev.length === 0 ? loadDefaultServerUrl() : ''),
    ]);
  };

  const handleChangeServer = (id: string, patch: Partial<ServerConnection>) => {
    onServersChange((prev) =>
      prev.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    );
  };

  const handleRemoveServer = (id: string) => {
    onServersChange((prev) => prev.filter((server) => server.id !== id));
  };

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="subtitle1">Server maps</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon fontSize="small" />}
          onClick={handleAddServer}
        >
          Add server
        </Button>
      </Stack>
      {servers.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Add a server to load maps from an overlay server.
        </Typography>
      ) : (
        servers.map((server) => (
          <ServerConnectionCard
            key={server.id}
            connection={server}
            onChange={(patch) => handleChangeServer(server.id, patch)}
            onRemove={() => handleRemoveServer(server.id)}
          />
        ))
      )}
    </Stack>
  );
}
