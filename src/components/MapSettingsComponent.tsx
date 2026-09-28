import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { loadCustomStyleUrl, loadMapStyles } from '../lib/storage';

// Select values besides the url of a configured style: the default (the
// first configured style, or the built-in one without any) and a url of the
// user's own.
const DEFAULT_OPTION = '';
const CUSTOM_OPTION = 'custom';

function MapSettingsComponent({
  styleUrl,
  onApplyStyle,
}: {
  styleUrl: string;
  // An empty url goes back to the default style. Returns the style url now
  // in use.
  onApplyStyle: (url: string) => string;
}) {
  const [mapStyles] = useState(loadMapStyles);
  const [selected, setSelected] = useState(() => {
    const customUrl = loadCustomStyleUrl();
    const index = mapStyles.findIndex((style) => style.url === customUrl);
    if (!customUrl || index === 0) {
      return DEFAULT_OPTION;
    }
    return index > 0 ? customUrl : CUSTOM_OPTION;
  });
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);
  const [error, setError] = useState<string | null>(null);

  const applyStyle = (url: string) => {
    setStyleUrlDraft(onApplyStyle(url));
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
      <Typography variant="subtitle1">Basemap style</Typography>
      <TextField
        select
        label="Style"
        size="small"
        fullWidth
        value={selected}
        onChange={(event) => handleSelect(event.target.value)}
      >
        {mapStyles.length === 0 ? (
          <MenuItem value={DEFAULT_OPTION}>Default</MenuItem>
        ) : (
          mapStyles.map((style, index) => (
            <MenuItem
              key={style.url}
              value={index === 0 ? DEFAULT_OPTION : style.url}
            >
              {index === 0 ? `${style.name} (default)` : style.name}
            </MenuItem>
          ))
        )}
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
