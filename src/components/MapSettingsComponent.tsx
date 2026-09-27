import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { loadCustomStyleUrl } from '../lib/storage';

export function MapSettingsComponent({
  styleUrl,
  onApplyStyle,
}: {
  styleUrl: string;
  // An empty url goes back to the default style. Returns the style url now
  // in use.
  onApplyStyle: (url: string) => string;
}) {
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);
  const [isCustom, setIsCustom] = useState(() => !!loadCustomStyleUrl());
  const [error, setError] = useState<string | null>(null);

  const applyStyle = (url: string) => {
    setStyleUrlDraft(onApplyStyle(url));
    setIsCustom(!!url);
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

  const handleReset = () => {
    setError(null);
    applyStyle('');
  };

  return (
    <Stack component="form" spacing={1.5} onSubmit={handleStyleSubmit}>
      <Typography variant="subtitle1">Basemap style</Typography>
      <Typography variant="body2" color="text.secondary">
        {isCustom
          ? 'Using a custom style.'
          : 'Using the default style of this deployment.'}
      </Typography>
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
        <Button size="small" disabled={!isCustom} onClick={handleReset}>
          Reset to default
        </Button>
      </Stack>
    </Stack>
  );
}

export default MapSettingsComponent;
