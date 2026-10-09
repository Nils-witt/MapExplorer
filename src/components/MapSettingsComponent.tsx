import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import {
  type ColorScheme,
  loadCustomStyleUrl,
  loadMapStyles,
} from '../lib/storage';

// Select values besides the url of a configured style: the default (the
// first configured style, or the built-in one without any; in dark mode, the
// light mode style) and a url of the user's own.
const DEFAULT_OPTION = '';
const CUSTOM_OPTION = 'custom';

function MapSettingsComponent({
  styleUrls,
  onApplyStyle,
}: {
  styleUrls: Record<ColorScheme, string>;
  // An empty url goes back to the default style. Returns the style url now
  // in use for that scheme.
  onApplyStyle: (scheme: ColorScheme, url: string) => string;
}) {
  return (
    <Stack spacing={3}>
      <BasemapSelect
        scheme="light"
        label="Light mode"
        styleUrl={styleUrls.light}
        onApplyStyle={onApplyStyle}
      />
      <BasemapSelect
        scheme="dark"
        label="Dark mode"
        styleUrl={styleUrls.dark}
        onApplyStyle={onApplyStyle}
      />
    </Stack>
  );
}

function BasemapSelect({
  scheme,
  label,
  styleUrl,
  onApplyStyle,
}: {
  scheme: ColorScheme;
  label: string;
  styleUrl: string;
  onApplyStyle: (scheme: ColorScheme, url: string) => string;
}) {
  const [mapStyles] = useState(loadMapStyles);
  // In light mode the first configured style is the default. In dark mode
  // the default is the light mode style, so every configured style is a
  // choice of its own.
  const defaultIndex = scheme === 'light' ? 0 : -1;
  const [selected, setSelected] = useState(() => {
    const customUrl = loadCustomStyleUrl(scheme);
    const index = mapStyles.findIndex((style) => style.url === customUrl);
    if (!customUrl || index === defaultIndex) {
      return DEFAULT_OPTION;
    }
    return index >= 0 ? customUrl : CUSTOM_OPTION;
  });
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);
  const [error, setError] = useState<string | null>(null);

  const applyStyle = (url: string) => {
    setStyleUrlDraft(onApplyStyle(scheme, url));
  };

  const handleSelect = (value: string) => {
    setError(null);
    setSelected(value);
    if (value !== CUSTOM_OPTION) {
      applyStyle(value);
    }
  };

  const handleStyleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = styleUrlDraft.trim();
    try {
      new URL(trimmed);
    } catch {
      setError('Enter a valid URL');
      return;
    }
    setError(null);
    applyStyle(trimmed);
  };

  return (
    <Stack component="form" spacing={1.5} onSubmit={handleStyleSubmit}>
      <Typography variant="subtitle1">{label} basemap</Typography>
      <TextField
        select
        label="Style"
        size="small"
        fullWidth
        value={selected}
        onChange={(event) => handleSelect(event.target.value)}
      >
        {scheme === 'dark' && (
          <MenuItem value={DEFAULT_OPTION}>Same as light mode</MenuItem>
        )}
        {scheme === 'light' && mapStyles.length === 0 && (
          <MenuItem value={DEFAULT_OPTION}>Default</MenuItem>
        )}
        {mapStyles.map((style, index) => (
          <MenuItem
            key={style.url}
            value={index === defaultIndex ? DEFAULT_OPTION : style.url}
          >
            {index === defaultIndex ? `${style.name} (default)` : style.name}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM_OPTION}>Custom URL…</MenuItem>
      </TextField>
      {selected === CUSTOM_OPTION && (
        <>
          <TextField
            label="Style URL"
            type="url"
            size="small"
            fullWidth
            value={styleUrlDraft}
            onChange={(event) => setStyleUrlDraft(event.target.value)}
            placeholder="https://example.com/style.json"
            error={!!error}
            helperText={error ?? 'A MapLibre style.json'}
          />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="outlined" size="small">
              Apply style
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}

export default MapSettingsComponent;
