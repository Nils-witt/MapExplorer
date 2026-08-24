import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { GeoObjectRequest } from '../api/serverApi';
import type { GeoObjectEntry } from '../types';
import {
  describeGeoObjectError,
  useGeoObjects,
} from '../context/GeoObjectsContext';

interface EditGeoObjectDialogProps {
  open: boolean;
  entry: GeoObjectEntry | null;
  onClose: () => void;
}

interface FormState {
  name: string;
  latitude: string;
  longitude: string;
  externalId: string;
  street: string;
  housenumber: string;
  postcode: string;
}

function toFormState(entry: GeoObjectEntry): FormState {
  return {
    name: entry.geoObject.name,
    latitude: String(entry.geoObject.latitude),
    longitude: String(entry.geoObject.longitude),
    externalId: entry.geoObject.externalId ?? '',
    street: entry.geoObject.street ?? '',
    housenumber: entry.geoObject.housenumber ?? '',
    postcode: entry.geoObject.postcode ?? '',
  };
}

export function EditGeoObjectDialog({
  open,
  entry,
  onClose,
}: EditGeoObjectDialogProps) {
  const { updateGeoObject } = useGeoObjects();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setForm(toFormState(entry));
      setError(null);
    }
  }, [entry]);

  const setField =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) =>
        prev ? { ...prev, [field]: event.target.value } : prev,
      );
    };

  const latitude = form ? Number(form.latitude) : NaN;
  const longitude = form ? Number(form.longitude) : NaN;
  const canSave =
    Boolean(form) &&
    form!.name.trim().length > 0 &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !saving;

  const handleClose = () => {
    if (saving) {
      return;
    }
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!entry || !form || !canSave) {
      return;
    }
    const request: GeoObjectRequest = {
      name: form.name.trim(),
      latitude,
      longitude,
      externalId: form.externalId.trim() || undefined,
      street: form.street.trim() || undefined,
      housenumber: form.housenumber.trim() || undefined,
      postcode: form.postcode.trim() || undefined,
    };
    setSaving(true);
    setError(null);
    try {
      await updateGeoObject(entry.overlayId, entry.geoObject.uuid, request);
      onClose();
    } catch (err) {
      setError(describeGeoObjectError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { component: 'form', onSubmit: handleSubmit } }}
    >
      <DialogTitle>Edit marker</DialogTitle>
      <DialogContent>
        {form && entry ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Name"
              size="small"
              fullWidth
              required
              autoFocus
              value={form.name}
              onChange={setField('name')}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude"
                size="small"
                fullWidth
                required
                type="number"
                slotProps={{ htmlInput: { step: 'any' } }}
                value={form.latitude}
                onChange={setField('latitude')}
              />
              <TextField
                label="Longitude"
                size="small"
                fullWidth
                required
                type="number"
                slotProps={{ htmlInput: { step: 'any' } }}
                value={form.longitude}
                onChange={setField('longitude')}
              />
            </Stack>
            <TextField
              label="External ID"
              size="small"
              fullWidth
              value={form.externalId}
              onChange={setField('externalId')}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Street"
                size="small"
                fullWidth
                value={form.street}
                onChange={setField('street')}
              />
              <TextField
                label="House number"
                size="small"
                fullWidth
                value={form.housenumber}
                onChange={setField('housenumber')}
              />
            </Stack>
            <TextField
              label="Postcode"
              size="small"
              fullWidth
              value={form.postcode}
              onChange={setField('postcode')}
            />

            <Divider />

            <Typography variant="subtitle2" color="text.secondary">
              Details
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                UUID: {entry.geoObject.uuid}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Map version: {entry.geoObject.version}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Created: {entry.geoObject.createdAt} by{' '}
                {entry.geoObject.createdBy}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Updated: {entry.geoObject.updatedAt} by{' '}
                {entry.geoObject.updatedBy}
              </Typography>
            </Stack>
          </Stack>
        ) : null}
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
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
