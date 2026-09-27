import { memo, useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { Marker, Popup } from '@vis.gl/react-maplibre';
import type { Unit, UnitPosition } from '../api/UnitServer';
import { useDisplaySettings } from '../context/DisplaySettingsContext';
import { useUnits } from '../context/UnitsContext';
import { formatTacticalName, symbolDataUrl } from '../lib/unitSymbol';
import './UnitMarkers.scss';

// Draws every unit with a position from the connected unit servers, as its
// tactical symbol (or a dot without one), with a popup on click.
export function UnitMarkers() {
  const { allUnits } = useUnits();
  const { unitSymbolSize } = useDisplaySettings();
  // `${serverId}/${unitId}` of the unit whose popup is open.
  const [openKey, setOpenKey] = useState<string | null>(null);

  return allUnits.map(({ serverId, unit }) => {
    if (!unit.position) {
      return null;
    }
    const key = `${serverId}/${unit.id}`;
    return (
      <UnitMarker
        key={key}
        markerKey={key}
        unit={unit}
        position={unit.position}
        popupOpen={openKey === key}
        symbolSize={unitSymbolSize}
        setOpenKey={setOpenKey}
      />
    );
  });
}

function timestampToRelativeTime(dateStr: string): string {
  const timestamp = new Date(dateStr).getTime();
  const now = Date.now();
  const diffSeconds = Math.floor((now - timestamp) / 1000);
  console.log(
    `timestampToRelativeTime: now=${now}, timestamp=${timestamp}, diffSeconds=${diffSeconds}`,
  );
  if (diffSeconds < 60) {
    return `${diffSeconds} s ago`;
  } else if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} min ago`;
  } else if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours} h ago`;
  }
  return `>24 h ago`;
}

// Memoized so a change to one unit doesn't re-render every other marker.
const UnitMarker = memo(function UnitMarker({
  markerKey,
  unit,
  position,
  popupOpen,
  symbolSize,
  setOpenKey,
}: {
  markerKey: string;
  unit: Unit;
  position: UnitPosition;
  popupOpen: boolean;
  symbolSize: number;
  setOpenKey: Dispatch<SetStateAction<string | null>>;
}) {
  const src = useMemo(
    () => symbolDataUrl(unit.symbol, unit.tacticalName),
    [unit.symbol, unit.tacticalName],
  );

  return (
    <>
      <Marker
        latitude={position.lat}
        longitude={position.lon}
        onClick={(event) => {
          // Keep the map's own click handler from seeing it.
          event.originalEvent.stopPropagation();
          setOpenKey((prev) => (prev === markerKey ? null : markerKey));
        }}
        anchor={'bottom-right'}
      >
        <div
          className="unit-marker"
          title={unit.name}
          style={{ '--unit-symbol-size': `${symbolSize}px` } as CSSProperties}
        >
          {src ? (
            <img className="unit-marker__symbol" src={src} alt={unit.name} />
          ) : (
            <span className="unit-marker__dot" />
          )}
          <div className="labelbox">
            {unit.position?.timestamp && (
              <>{timestampToRelativeTime(unit.position.timestamp)}</>
            )}
          </div>
        </div>
      </Marker>
      {popupOpen && (
        <Popup
          latitude={position.lat}
          longitude={position.lon}
          offset={src ? 22 : 8}
          closeOnClick={false}
          onClose={() =>
            setOpenKey((prev) => (prev === markerKey ? null : prev))
          }
        >
          <UnitDetails unit={unit} position={position} />
        </Popup>
      )}
    </>
  );
});

function UnitDetails({
  unit,
  position,
}: {
  unit: Unit;
  position: UnitPosition;
}) {
  const tacticalName = formatTacticalName(unit.tacticalName);
  const { lat, lon, height, accuracy, speed, course, timestamp } = position;
  const details = [
    `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    height !== null ? `${Math.round(height)} m` : null,
    accuracy !== null ? `±${Math.round(accuracy)} m` : null,
    speed !== null ? `${Math.round(speed * 3.6)} km/h` : null,
    course !== null ? `${Math.round(course)}°` : null,
  ].filter(Boolean);
  return (
    <div className="unit-popup">
      <strong>{unit.name}</strong>
      {tacticalName && <div>{tacticalName}</div>}
      <div>{details.join(' · ')}</div>
      {timestamp && (
        <div className="unit-popup__time">
          {new Date(timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}
