import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '@mui/material/styles';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { useDisplaySettings } from '../../context/DisplaySettingsContext.tsx';
import {
  DEFAULT_UNIT_SYMBOL_SIZE,
  MAX_UNIT_SYMBOL_SIZE,
  MIN_UNIT_SYMBOL_SIZE,
} from '../../lib/storage.ts';

export default function DisplaySettings() {
  const { unitSymbolSize, setUnitSymbolSize } = useDisplaySettings();
  const { mode, setMode } = useColorScheme();

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1">Appearance</Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode ?? 'system'}
        onChange={(_event, value: 'light' | 'system' | 'dark' | null) => {
          if (value) {
            setMode(value);
          }
        }}
        aria-label="Color mode"
      >
        <ToggleButton value="light">
          <LightModeIcon fontSize="small" sx={{ mr: 1 }} />
          Light
        </ToggleButton>
        <ToggleButton value="system">
          <SettingsBrightnessIcon fontSize="small" sx={{ mr: 1 }} />
          System
        </ToggleButton>
        <ToggleButton value="dark">
          <DarkModeIcon fontSize="small" sx={{ mr: 1 }} />
          Dark
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="subtitle1">Unit symbols</Typography>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ flexShrink: 0 }}>
          Size
        </Typography>
        <Slider
          value={unitSymbolSize}
          min={MIN_UNIT_SYMBOL_SIZE}
          max={MAX_UNIT_SYMBOL_SIZE}
          step={5}
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => `${value} px`}
          onChange={(_event, value) => setUnitSymbolSize(value as number)}
          aria-label="Unit symbol size"
        />
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ minWidth: 48, textAlign: 'right' }}
        >
          {unitSymbolSize} px
        </Typography>
      </Stack>
      <Stack direction="row">
        <Button
          size="small"
          variant="outlined"
          disabled={unitSymbolSize === DEFAULT_UNIT_SYMBOL_SIZE}
          onClick={() => setUnitSymbolSize(DEFAULT_UNIT_SYMBOL_SIZE)}
        >
          Reset to default
        </Button>
      </Stack>
    </Stack>
  );
}
