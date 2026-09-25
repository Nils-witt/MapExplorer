import { useControl } from '@vis.gl/react-maplibre';
import { SettingsControl } from '../../controls/SettingsControl';

export function SettingsButtonControl({ onOpen }: { onOpen: () => void }) {
  useControl(() => new SettingsControl(onOpen), { position: 'top-right' });
  return null;
}
