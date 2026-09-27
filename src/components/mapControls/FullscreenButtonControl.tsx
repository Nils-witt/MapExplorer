import { useControl } from '@vis.gl/react-maplibre';
import { FullscreenControl } from 'maplibre-gl';

// Fullscreens the whole page rather than just the map, so the dialogs and
// alerts rendered outside it stay visible.
export function FullscreenButtonControl() {
  useControl(() => new FullscreenControl({ container: document.body }), {
    position: 'top-left',
  });
  return null;
}
