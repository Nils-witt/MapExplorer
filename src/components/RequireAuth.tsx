import { Navigate, Outlet } from 'react-router';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../context/AuthContext';

// Sends signed-out users to the login page. Waits for the stored session to
// be read first, so a reload doesn't bounce a signed-in user to /login.
export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
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
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
