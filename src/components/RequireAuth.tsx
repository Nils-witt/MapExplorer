import { Navigate, Outlet } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../context/AuthContext';

// Sends signed-out users to the login page. Waits for the stored session to
// be read first, so a reload doesn't bounce a signed-in user to /login.
// Without SSO there is nothing to sign in to up front.
export function RequireAuth() {
  const { isAuthenticated, loading, ssoEnabled } = useAuth();
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }
  if (ssoEnabled && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
