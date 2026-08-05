import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

const LIST_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' +
  '<path d="M4 5h2v2H4V5zm4 0h12v2H8V5zM4 11h2v2H4v-2zm4 0h12v2H8v-2zM4 17h2v2H4v-2zm4 0h12v2H8v-2z"/>' +
  '</svg>';

export class MarkersListControl implements IControl {
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
    button.className = 'maplibregl-ctrl-markers-list';
    button.setAttribute('aria-label', 'Marker list');
    button.title = 'Marker list';
    button.innerHTML = LIST_ICON_SVG;
    button.addEventListener('click', () => this.onOpen());

    this.container.appendChild(button);
    return this.container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
  }
}
