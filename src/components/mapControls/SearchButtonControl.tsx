import { useEffect, useMemo } from 'react';
import { useControl } from '@vis.gl/react-maplibre';
import type { SearchableGeoObject } from '../../controls/SearchControl';
import { SearchControl } from '../../controls/SearchControl';
import { useOverlays } from '../../context/OverlaysContext.tsx';
import { useUnits } from '../../context/UnitsContext';
import { formatTacticalName } from '../../lib/unitSymbol';

export function SearchButtonControl({
  onSelect,
}: {
  onSelect: (uuid: string, latitude: number, longitude: number) => void;
}) {
  const control = useControl<SearchControl>(() => new SearchControl(), {
    position: 'top-left',
  });
  const { geoObjects, enabledOverlays } = useOverlays();
  const { allUnits } = useUnits();

  // Only the geo objects of the version each enabled overlay draws.
  const overlayItems: SearchableGeoObject[] = useMemo(
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

  // Only units with a position, as those are the ones on the map.
  const unitItems: SearchableGeoObject[] = useMemo(
    () =>
      allUnits.flatMap(({ serverId, unit }) => {
        if (!unit.position) {
          return [];
        }
        const tacticalName = formatTacticalName(unit.tacticalName);
        return [
          {
            uuid: `${serverId}/${unit.id}`,
            label: unit.name,
            sublabel: tacticalName ?? 'Unit',
            searchText: [unit.name, tacticalName]
              .filter(Boolean)
              .join(' ')
              .toLowerCase(),
            latitude: unit.position.lat,
            longitude: unit.position.lon,
          },
        ];
      }),
    [allUnits],
  );

  const items = useMemo(
    () => [...unitItems, ...overlayItems],
    [unitItems, overlayItems],
  );

  useEffect(() => {
    control.setItems(items);
  }, [control, items]);

  useEffect(() => {
    control.setOnSelect(onSelect);
  }, [control, onSelect]);

  return null;
}
