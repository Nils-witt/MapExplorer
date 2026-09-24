import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { startOidcLogin } from '../lib/oidc';

function LoginPage() {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSSO = () => {
    setError(null);
    setRedirecting(true);
    startOidcLogin().catch((err: unknown) => {
      setRedirecting(false);
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 400, p: 4 }}>
        <Stack spacing={3} component="form">
          <Stack spacing={1} sx={{ alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              <LockOutlinedIcon />
            </Avatar>
            <Typography variant="h5" component="h1">
              Sign in
            </Typography>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={startSSO}
            loading={redirecting}
          >
            Login with SSO
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

export default LoginPage;
