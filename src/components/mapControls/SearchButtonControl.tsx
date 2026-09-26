import { useEffect, useMemo } from 'react';
import { useControl } from '@vis.gl/react-maplibre';
import type { SearchableGeoObject } from '../../controls/SearchControl';
import { SearchControl } from '../../controls/SearchControl';
import { useOverlays } from '../../context/OverlaysContext.tsx';

export function SearchButtonControl({
  onSelect,
}: {
  onSelect: (uuid: string, latitude: number, longitude: number) => void;
}) {
  const control = useControl<SearchControl>(() => new SearchControl(), {
    position: 'top-left',
  });
  const { geoObjects, enabledOverlays } = useOverlays();

  // Only the geo objects of the version each enabled overlay draws.
  const items: SearchableGeoObject[] = useMemo(
    () =>
      enabledOverlays.flatMap((overlay) =>
        (
          geoObjects[overlay.serverId]?.[overlay.id]?.[overlay.version] ?? []
        ).map((entry) => ({
          uuid: entry.uuid,
          label: entry.name,
          sublabel: '',
          searchText: entry.name.toLowerCase(),
          latitude: entry.latitude,
          longitude: entry.longitude,
        })),
      ),
    [enabledOverlays, geoObjects],
  );

  useEffect(() => {
    control.setItems(items);
  }, [control, items]);

  useEffect(() => {
    control.setOnSelect(onSelect);
  }, [control, onSelect]);

  return null;
}
