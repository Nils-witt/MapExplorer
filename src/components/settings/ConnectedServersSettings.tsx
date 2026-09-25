import Stack from '@mui/material/Stack';
import { useConnectedServers } from '../../context/ConnectedServersContext.tsx';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';

export default function ConnectedServersSettings() {
  const { overlayServers, unitServers } = useConnectedServers();
  return (
    <Stack>
      {overlayServers.map((server) => (
        <Paper key={server.id} sx={{ p: 2, mb: 1 }}>
          <Typography variant="h6">{server.name}</Typography>
          <Typography variant="subtitle1">{server.baseUrl}</Typography>
        </Paper>
      ))}
      {unitServers.map((server) => (
        <div key={server.id}>
          <h3>{server.name}</h3>
          <p>Base URL: {server.baseUrl}</p>
        </div>
      ))}
    </Stack>
  );
}
