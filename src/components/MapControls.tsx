import { useEffect } from 'react';
import { useControl } from '@vis.gl/react-maplibre';
import { SettingsControl } from '../controls/SettingsControl';
import { MarkerControl } from '../controls/MarkerControl';
import { MarkersListControl } from '../controls/MarkersListControl';
import type { SearchableGeoObject } from '../controls/SearchControl';
import { SearchControl } from '../controls/SearchControl';

export function SettingsButtonControl({ onOpen }: { onOpen: () => void }) {
  useControl(() => new SettingsControl(onOpen), { position: 'top-right' });
  return null;
}

export function MarkersListButtonControl({ onOpen }: { onOpen: () => void }) {
  useControl(() => new MarkersListControl(onOpen), { position: 'top-left' });
  return null;
}

export function SearchButtonControl({
  items,
  onSelect,
}: {
  items: SearchableGeoObject[];
  onSelect: (uuid: string) => void;
}) {
  const control = useControl<SearchControl>(() => new SearchControl(), {
    position: 'top-left',
  });

  useEffect(() => {
    control.setItems(items);
  }, [control, items]);

  useEffect(() => {
    control.setOnSelect(onSelect);
  }, [control, onSelect]);

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
