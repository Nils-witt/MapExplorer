import { FormControlLabel, Stack, Switch, Typography } from '@mui/material';

function MarkerSettingsComponent({
  markersEnabled,
  onMarkersEnabledChange,
}: {
  markersEnabled: boolean;
  onMarkersEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">Markers</Typography>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={markersEnabled}
            onChange={(event) => onMarkersEnabledChange(event.target.checked)}
          />
        }
        label={<Typography variant="body2">Enable marker editing</Typography>}
      />
    </Stack>
  );
}

export default MarkerSettingsComponent;
