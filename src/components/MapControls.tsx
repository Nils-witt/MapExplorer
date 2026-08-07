import { useEffect } from 'react';
import { useControl } from '@vis.gl/react-maplibre';
import { SettingsControl } from './SettingsControl';
import { MarkerControl } from './MarkerControl';
import { MarkersListControl } from './MarkersListControl';

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
}: {
  active: boolean;
  onToggle: () => void;
}) {
  const control = useControl<MarkerControl>(() => new MarkerControl(onToggle), {
    position: 'top-left',
  });

  useEffect(() => {
    control.setActive(active);
  }, [control, active]);

  return null;
}
