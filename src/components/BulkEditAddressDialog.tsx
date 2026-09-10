import { useState } from 'react';
import type { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { GeoObjectRequest } from '../api/serverApi';
import type { GeoObjectEntry } from '../types';
import { useGeoObjects } from '../context/GeoObjectsContext';

interface BulkEditAddressDialogProps {
  open: boolean;
  entries: GeoObjectEntry[];
  onClose: () => void;
}

type AddressField =
  'street' | 'housenumber' | 'postcode' | 'city' | 'cityDistrict';

interface FieldConfig {
  field: AddressField;
  label: string;
}

const FIELD_CONFIGS: FieldConfig[] = [
  { field: 'street', label: 'Street' },
  { field: 'housenumber', label: 'House number' },
  { field: 'postcode', label: 'Postcode' },
  { field: 'city', label: 'City' },
  { field: 'cityDistrict', label: 'City district' },
];

type ApplyState = Record<AddressField, boolean>;
type ValueState = Record<AddressField, string>;

const initialApply: ApplyState = {
  street: false,
  housenumber: false,
  postcode: false,
  city: false,
  cityDistrict: false,
};

const initialValues: ValueState = {
  street: '',
  housenumber: '',
  postcode: '',
  city: '',
  cityDistrict: '',
};

export function BulkEditAddressDialog({
  open,
  entries,
  onClose,
}: BulkEditAddressDialogProps) {
  const { updateGeoObject } = useGeoObjects();
  const [apply, setApply] = useState<ApplyState>(initialApply);
  const [values, setValues] = useState<ValueState>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyFieldSelected = FIELD_CONFIGS.some(({ field }) => apply[field]);
  const canSave = entries.length > 0 && anyFieldSelected && !saving;

  const handleClose = () => {
    if (saving) {
      return;
    }
    setApply(initialApply);
    setValues(initialValues);
    setError(null);
    onClose();
  };

  const toggleApply =
    (field: AddressField) => (event: { target: { checked: boolean } }) => {
      setApply((prev) => ({ ...prev, [field]: event.target.checked }));
    };

  const setValue =
    (field: AddressField) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    let failed = 0;
    for (const entry of entries) {
      const request: GeoObjectRequest = {
        name: entry.geoObject.name,
        latitude: entry.geoObject.latitude,
        longitude: entry.geoObject.longitude,
        externalId: entry.geoObject.externalId,
        street: apply.street
          ? values.street.trim() || undefined
          : entry.geoObject.street,
        housenumber: apply.housenumber
          ? values.housenumber.trim() || undefined
          : entry.geoObject.housenumber,
        postcode: apply.postcode
          ? values.postcode.trim() || undefined
          : entry.geoObject.postcode,
        city: apply.city
          ? values.city.trim() || undefined
          : entry.geoObject.city,
        cityDistrict: apply.cityDistrict
          ? values.cityDistrict.trim() || undefined
          : entry.geoObject.cityDistrict,
      };
      try {
        await updateGeoObject(entry.overlayId, entry.geoObject.uuid, request);
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    if (failed > 0) {
      setError(
        `${failed} of ${entries.length} marker${entries.length === 1 ? '' : 's'} could not be updated.`,
      );
      return;
    }
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: 'form', onSubmit: handleSubmit } }}
    >
      <DialogTitle>
        Edit address for {entries.length} marker
        {entries.length === 1 ? '' : 's'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2" color="text.secondary">
            Check a field to apply its value to every selected marker. Leave a
            field unchecked to keep each marker&apos;s existing value.
          </Typography>
          {FIELD_CONFIGS.map(({ field, label }) => (
            <Stack
              key={field}
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={apply[field]}
                    onChange={toggleApply(field)}
                  />
                }
                label=""
                sx={{ mr: 0 }}
              />
              <TextField
                label={label}
                size="small"
                fullWidth
                disabled={!apply[field]}
                value={values[field]}
                onChange={setValue(field)}
              />
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={!canSave}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
