import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { completeOidcLogin } from '../lib/oidc';

function LoginCallbackPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    completeOidcLogin(search)
      .then(() => {
        if (!cancelled) {
          navigate('/', { replace: true });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [search, navigate]);

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
        {error ? (
          <Stack spacing={3}>
            <Typography
              variant="h5"
              component="h1"
              sx={{ textAlign: 'center' }}
            >
              Sign-in failed
            </Typography>
            <Alert severity="error">{error}</Alert>
            <Button
              component={RouterLink}
              to="/login"
              replace
              variant="contained"
              size="large"
              fullWidth
            >
              Back to sign in
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ alignItems: 'center' }}>
            <CircularProgress />
            <Typography>Signing you in…</Typography>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

export default LoginCallbackPage;
