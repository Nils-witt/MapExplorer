import { Avatar, Button, Stack, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';

function UserSettingsComponent() {
  const { user, profile, logout } = useAuth();

  if (!user || !profile) {
    return (
      <Stack spacing={1}>
        <Typography variant="subtitle1">User</Typography>
        <Typography variant="body2" color="text.secondary">
          Not signed in.
        </Typography>
      </Stack>
    );
  }

  const displayName =
    profile.name ?? profile.preferred_username ?? profile.email ?? profile.sub;
  const expiresAt = user.expires_at
    ? new Date(user.expires_at * 1000).toLocaleString()
    : null;

  const rows: [string, string | undefined | null][] = [
    ['Username', profile.preferred_username],
    ['Email', profile.email],
    ['Subject', profile.sub],
    ['Issuer', profile.iss],
    ['Scopes', user.scope],
    ['Session expires', expiresAt],
  ];

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">User</Typography>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Avatar src={profile.picture} alt={displayName}>
          {displayName.charAt(0).toUpperCase()}
        </Avatar>
        <Typography variant="h6">{displayName}</Typography>
      </Stack>
      <Stack spacing={1}>
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <Stack key={label} direction="row" spacing={2}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ minWidth: 120, flexShrink: 0 }}
              >
                {label}
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {value}
              </Typography>
            </Stack>
          ))}
      </Stack>
      <Stack direction="row">
        <Button variant="outlined" color="error" onClick={() => void logout()}>
          Sign out
        </Button>
      </Stack>
    </Stack>
  );
}

export default UserSettingsComponent;
