import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

const SETTINGS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' +
  '<path d="M19.14 12.94a7.14 7.14 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.46.02.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>' +
  '</svg>';

export class SettingsControl implements IControl {
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
    button.className = 'maplibregl-ctrl-settings';
    button.setAttribute('aria-label', 'Map settings');
    button.title = 'Map settings';
    button.innerHTML = SETTINGS_ICON_SVG;
    button.addEventListener('click', () => this.onOpen());

    this.container.appendChild(button);
    return this.container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
  }
}
