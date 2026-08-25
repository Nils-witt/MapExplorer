import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { loadDefaultServerUrl } from '../lib/storage';
import { useServers } from '../context/ServersContext';
import { ServerConnectionCard } from './ServerConnectionCard';
import {
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  Configuration,
  discovery,
  randomPKCECodeVerifier,
} from 'openid-client';
import { oauthConfig } from '../lib/oauth2';
export function ServerMapsSection() {
  const { servers, addServer, updateServer, removeServer } = useServers();

  const handleAddServer = () => {
    addServer(servers.length === 0 ? loadDefaultServerUrl() : '');
  };

  const execOauth = async () => {
    const config: Configuration = await discovery(
      new URL(oauthConfig.issuer),
      oauthConfig.clientId,
    );
    let code_verifier = randomPKCECodeVerifier();
    let code_challenge = await calculatePKCECodeChallenge(code_verifier);
    let state =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    let parameters: Record<string, string> = {
      redirect_uri: oauthConfig.redirect_uri,
      scope: 'openid email',
      code_challenge,
      code_challenge_method: oauthConfig.code_challenge_method,
      state: state,
    };

    localStorage.setItem('code_verifier', code_verifier);
    localStorage.setItem('state', state);
    let redirectTo = buildAuthorizationUrl(config, parameters);

    window.location.href = redirectTo.href;
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
      <Button onClick={execOauth}>OAuth</Button>
    </Stack>
  );
}
