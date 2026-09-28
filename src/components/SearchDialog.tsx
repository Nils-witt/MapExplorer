import { useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { useOverlays } from '../context/OverlaysContext.tsx';
import { useUnits } from '../context/UnitsContext';
import { formatTacticalName } from '../lib/unitSymbol';

interface SearchableGeoObject {
  uuid: string;
  label: string;
  sublabel: string;
  searchText: string;
  latitude: number;
  longitude: number;
}

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (uuid: string, latitude: number, longitude: number) => void;
}

const MAX_RESULTS = 50;

export function SearchDialog({ open, onClose, onSelect }: SearchDialogProps) {
  const [query, setQuery] = useState('');
  // On phones the dialog fills the screen.
  const isSmallScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const { geoObjects, enabledOverlays } = useOverlays();
  const { allUnits } = useUnits();

  // Only the geo objects of the version each enabled overlay draws.
  const overlayItems: SearchableGeoObject[] = useMemo(
    () =>
      enabledOverlays.flatMap((overlay) =>
        (
          geoObjects[overlay.serverId]?.[overlay.id]?.[overlay.version] ?? []
        ).map((entry) => ({
          uuid: entry.uuid,
          label: entry.name,
          sublabel: overlay.name,
          searchText: entry.name.toLowerCase(),
          latitude: entry.latitude,
          longitude: entry.longitude,
        })),
      ),
    [enabledOverlays, geoObjects],
  );

  // Only units with a position, as those are the ones on the map.
  const unitItems: SearchableGeoObject[] = useMemo(
    () =>
      allUnits.flatMap(({ serverId, unit }) => {
        if (!unit.position) {
          return [];
        }
        const tacticalName = formatTacticalName(unit.tacticalName);
        return [
          {
            uuid: `${serverId}/${unit.id}`,
            label: unit.name,
            sublabel: tacticalName ?? 'Unit',
            searchText: [unit.name, tacticalName]
              .filter(Boolean)
              .join(' ')
              .toLowerCase(),
            latitude: unit.position.lat,
            longitude: unit.position.lon,
          },
        ];
      }),
    [allUnits],
  );

  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      trimmedQuery
        ? [...unitItems, ...overlayItems]
            .filter((item) => item.searchText.includes(trimmedQuery))
            .slice(0, MAX_RESULTS)
        : [],
    [trimmedQuery, unitItems, overlayItems],
  );

  const handleSelect = (item: SearchableGeoObject) => {
    onSelect(item.uuid, item.latitude, item.longitude);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={isSmallScreen}
      slotProps={{
        // Start with an empty search next time, once the close has animated.
        transition: { onExited: () => setQuery('') },
        paper: {
          // Keep clear of the notch and home indicator in the fullscreen PWA.
          sx: isSmallScreen
            ? {
                pt: 'env(safe-area-inset-top)',
                pb: 'env(safe-area-inset-bottom)',
                pl: 'env(safe-area-inset-left)',
                pr: 'env(safe-area-inset-right)',
              }
            : { height: '60vh' },
        },
      }}
    >
      <DialogTitle sx={{ pr: 7 }}>Search markers</DialogTitle>
      <IconButton
        aria-label="Close"
        onClick={onClose}
        sx={{
          position: 'absolute',
          // The paper's safe-area padding doesn't move absolute children.
          top: isSmallScreen ? 'calc(env(safe-area-inset-top) + 12px)' : 12,
          right: isSmallScreen ? 'calc(env(safe-area-inset-right) + 12px)' : 12,
        }}
      >
        <CloseIcon />
      </IconButton>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search units and markers…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches.length > 0) {
              handleSelect(matches[0]);
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mt: 1 }}
        />
        {trimmedQuery && matches.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No markers found
          </Typography>
        ) : (
          <List dense>
            {matches.map((item) => (
              <ListItemButton
                key={item.uuid}
                onClick={() => handleSelect(item)}
              >
                <ListItemText
                  primary={item.label}
                  secondary={item.sublabel || undefined}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
