import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

const MARKER_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' +
  '<path d="M12 2c-4.42 0-8 3.58-8 8 0 5.25 7.05 11.34 7.35 11.6a1 1 0 0 0 1.3 0C12.95 21.34 20 15.25 20 10c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>' +
  '</svg>';

export class MarkerControl implements IControl {
  private container: HTMLDivElement | undefined;
  private button: HTMLButtonElement | undefined;
  private readonly onToggle: () => void;

  constructor(onToggle: () => void) {
    this.onToggle = onToggle;
  }

  onAdd(_map: MapLibreMap): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibregl-ctrl-add-marker';
    this.button.setAttribute('aria-label', 'Add marker');
    this.button.title = 'Add marker';
    this.button.innerHTML = MARKER_ICON_SVG;
    this.button.addEventListener('click', () => this.onToggle());

    this.container.appendChild(this.button);
    return this.container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
    this.button = undefined;
  }

  setActive(active: boolean): void {
    this.button?.classList.toggle('active', active);
  }
}
