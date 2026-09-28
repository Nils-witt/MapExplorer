import { useControl } from '@vis.gl/react-maplibre';
import { SearchControl } from '../../controls/SearchControl';

export function SearchButtonControl({ onOpen }: { onOpen: () => void }) {
  useControl(() => new SearchControl(onOpen), { position: 'top-left' });
  return null;
}
