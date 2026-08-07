import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { loadDefaultServerUrl } from '../lib/storage';
import { useServers } from '../context/ServersContext';
import { ServerConnectionCard } from './ServerConnectionCard';

export function ServerMapsSection() {
  const { servers, addServer, updateServer, removeServer } = useServers();

  const handleAddServer = () => {
    addServer(servers.length === 0 ? loadDefaultServerUrl() : '');
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
            onChange={(patch) => updateServer(server.id, patch)}
            onRemove={() => removeServer(server.id)}
          />
        ))
      )}
    </Stack>
  );
}
