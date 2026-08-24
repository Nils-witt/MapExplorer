import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';

export function MapSettingsComponent({
  styleUrl,
  onApplyStyle,
}: {
  styleUrl: string;
  onApplyStyle: (url: string) => void;
}) {
  const [styleUrlDraft, setStyleUrlDraft] = useState(styleUrl);

  const handleStyleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = styleUrlDraft.trim();
    if (trimmed) {
      onApplyStyle(trimmed);
    }
  };

  return (
    <Stack
      component="form"
      spacing={1.5}
      onSubmit={handleStyleSubmit}
      sx={{ minWidth: '500px' }}
    >
      <Typography variant="subtitle1">Map style</Typography>
      <TextField
        label="Style URL"
        type="url"
        size="small"
        fullWidth
        value={styleUrlDraft}
        onChange={(event) => setStyleUrlDraft(event.target.value)}
        placeholder="https://example.com/style.json"
      />
      <Button
        type="submit"
        variant="outlined"
        size="small"
        sx={{ alignSelf: 'flex-start' }}
      >
        Apply style
      </Button>
    </Stack>
  );
}

export default MapSettingsComponent;
