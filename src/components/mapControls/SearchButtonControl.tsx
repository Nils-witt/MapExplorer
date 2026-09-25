import { useEffect } from 'react';
import { useControl } from '@vis.gl/react-maplibre';
import type { SearchableGeoObject } from '../../controls/SearchControl';
import { SearchControl } from '../../controls/SearchControl';

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
