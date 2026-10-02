import { useState } from 'react';
import type { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/AuthContext.tsx';
import { useServerAuth } from '../../context/ServerAuthContext.tsx';
import type { ServerSession } from '../../lib/storage.ts';
import type { ConnectedServer } from '../../types.ts';

// Signing in to a server with one of its own accounts, in place of (or
// without) SSO.
export default function ServerSignIn({
  server,
  kind,
}: {
  server: ConnectedServer;
  kind: ServerSession['kind'];
}) {
  const { ssoEnabled } = useAuth();
  const { sessions, logout } = useServerAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const session = sessions[server.id];

  if (session) {
    const expires =
      session.expiresAt !== null && !session.refreshToken
        ? ` until ${new Date(session.expiresAt).toLocaleString()}`
        : '';
    return (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}
      >
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          label={`Signed in as ${session.username}${expires}`}
        />
        <Button size="small" onClick={() => void logout(server)}>
          Sign out
        </Button>
      </Stack>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}
    >
      <Typography variant="body2" color="text.secondary">
        {ssoEnabled ? 'Using single sign-on' : 'Not signed in'}
      </Typography>
      <Button size="small" onClick={() => setDialogOpen(true)}>
        Sign in
      </Button>
      {dialogOpen && (
        <SignInDialog
          server={server}
          kind={kind}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </Stack>
  );
}

function SignInDialog({
  server,
  kind,
  onClose,
}: {
  server: ConnectedServer;
  kind: ServerSession['kind'];
  onClose: () => void;
}) {
  const { login } = useServerAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(server, kind, username.trim(), password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={(event) => void handleSubmit(event)}>
        <DialogTitle>Sign in to {server.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" loading={submitting}>
            Sign in
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
