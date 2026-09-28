import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import './SearchControl.scss';

const SEARCH_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' +
  '<path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>' +
  '</svg>';

export class SearchControl implements IControl {
  private container: HTMLDivElement | undefined;
  private readonly onOpen: () => void;

  constructor(onOpen: () => void) {
    this.onOpen = onOpen;
  }

  onAdd(_map: MapLibreMap): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'maplibregl-ctrl-search';
    button.setAttribute('aria-label', 'Search markers');
    button.title = 'Search markers';
    button.innerHTML = SEARCH_ICON_SVG;
    button.addEventListener('click', () => this.onOpen());

    this.container.appendChild(button);
    return this.container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
  }
}
