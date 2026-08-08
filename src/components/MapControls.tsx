import { useEffect } from 'react';
import { useControl } from '@vis.gl/react-maplibre';
import { SettingsControl } from '../controls/SettingsControl';
import { MarkerControl } from '../controls/MarkerControl';
import { MarkersListControl } from '../controls/MarkersListControl';

export function SettingsButtonControl({ onOpen }: { onOpen: () => void }) {
  useControl(() => new SettingsControl(onOpen), { position: 'top-right' });
  return null;
}

export function MarkersListButtonControl({ onOpen }: { onOpen: () => void }) {
  useControl(() => new MarkersListControl(onOpen), { position: 'top-left' });
  return null;
}

export function AddMarkerButtonControl({
  active,
  onToggle,
  disabled = false,
  disabledReason,
}: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const control = useControl<MarkerControl>(() => new MarkerControl(onToggle), {
    position: 'top-left',
  });

  useEffect(() => {
    control.setActive(active);
  }, [control, active]);

  useEffect(() => {
    control.setDisabled(disabled, disabledReason);
  }, [control, disabled, disabledReason]);

  return null;
}
