import { useMemo } from 'react';
import Avatar from '@mui/material/Avatar';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Unit } from '../../api/UnitServer.ts';
import { useConnectedServers } from '../../context/ConnectedServersContext.tsx';
import { useUnits } from '../../context/UnitsContext.tsx';
import { formatTacticalName, symbolDataUrl } from '../../lib/unitSymbol.ts';
import { isServerEnabled } from '../../types.ts';

// Lists the units of every enabled unit server, grouped by server.
export default function UnitsSettings() {
  const { unitServers } = useConnectedServers();
  const { units, status } = useUnits();
  const enabledServers = unitServers.filter(isServerEnabled);

  if (enabledServers.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No unit servers connected. Add one under Connected Servers.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {enabledServers.map((server) => (
        <Stack key={server.id} spacing={0.5}>
          <Typography variant="overline" color="text.secondary">
            {server.name}
          </Typography>
          <ServerUnits
            units={units[server.id]}
            emptyText={
              status[server.id]?.state === 'live'
                ? 'No units.'
                : status[server.id]?.state === 'signedOut'
                  ? 'Sign in to see units.'
                  : 'Units not loaded yet.'
            }
          />
        </Stack>
      ))}
    </Stack>
  );
}

function ServerUnits({
  units,
  emptyText,
}: {
  units: Record<string, Unit> | undefined;
  emptyText: string;
}) {
  const sorted = useMemo(
    () =>
      Object.values(units ?? {}).sort((a, b) => a.name.localeCompare(b.name)),
    [units],
  );

  if (sorted.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    );
  }

  return (
    <Paper variant="outlined">
      <List dense disablePadding>
        {sorted.map((unit, index) => (
          <UnitItem
            key={unit.id}
            unit={unit}
            divider={index < sorted.length - 1}
          />
        ))}
      </List>
    </Paper>
  );
}

function UnitItem({ unit, divider }: { unit: Unit; divider: boolean }) {
  const src = useMemo(
    () => symbolDataUrl(unit.symbol, unit.tacticalName),
    [unit.symbol, unit.tacticalName],
  );
  const { position } = unit;
  const secondary = [
    formatTacticalName(unit.tacticalName),
    position
      ? position.timestamp
        ? `Last position ${new Date(position.timestamp).toLocaleString()}`
        : 'Has position'
      : 'No position',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListItem divider={divider}>
      <ListItemAvatar>
        <Avatar
          variant="square"
          src={src ?? undefined}
          alt={unit.name}
          sx={{ bgcolor: src ? 'transparent' : undefined }}
          slotProps={{ img: { sx: { objectFit: 'contain' } } }}
        >
          {unit.name.charAt(0).toUpperCase()}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={unit.name}
        secondary={secondary}
        slotProps={{ secondary: { noWrap: true } }}
      />
    </ListItem>
  );
}
