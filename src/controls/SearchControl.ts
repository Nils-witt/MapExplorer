import type { IControl, Map as MapLibreMap } from 'maplibre-gl';

export interface SearchableGeoObject {
  uuid: string;
  label: string;
  sublabel: string;
  searchText: string;
}

const SEARCH_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">' +
  '<path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>' +
  '</svg>';

const MAX_RESULTS = 8;

export class SearchControl implements IControl {
  private container: HTMLDivElement | undefined;
  private input: HTMLInputElement | undefined;
  private resultsList: HTMLUListElement | undefined;
  private items: SearchableGeoObject[] = [];
  private expanded = false;
  private onSelect: (uuid: string) => void = () => {};

  onAdd(_map: MapLibreMap): HTMLElement {
    this.container = document.createElement('div');
    this.container.className =
      'maplibregl-ctrl maplibregl-ctrl-group maplibregl-ctrl-search';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'maplibregl-ctrl-search-toggle';
    toggleButton.setAttribute('aria-label', 'Search markers');
    toggleButton.title = 'Search markers';
    toggleButton.innerHTML = SEARCH_ICON_SVG;
    toggleButton.addEventListener('click', () => this.toggle());

    const panel = document.createElement('div');
    panel.className = 'search-ctrl-panel';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'search-ctrl-input';
    this.input.placeholder = 'Search markers…';
    this.input.addEventListener('input', () => this.renderResults());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.collapse();
      }
    });

    this.resultsList = document.createElement('ul');
    this.resultsList.className = 'search-ctrl-results';

    panel.appendChild(this.input);
    panel.appendChild(this.resultsList);

    this.container.appendChild(toggleButton);
    this.container.appendChild(panel);
    return this.container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
    this.input = undefined;
    this.resultsList = undefined;
  }

  setItems(items: SearchableGeoObject[]): void {
    this.items = items;
    this.renderResults();
  }

  setOnSelect(onSelect: (uuid: string) => void): void {
    this.onSelect = onSelect;
  }

  private toggle(): void {
    if (this.expanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  private expand(): void {
    this.expanded = true;
    this.container?.classList.add('expanded');
    this.input?.focus();
  }

  private collapse(): void {
    this.expanded = false;
    this.container?.classList.remove('expanded');
    if (this.input) {
      this.input.value = '';
    }
    this.renderResults();
  }

  private renderResults(): void {
    if (!this.resultsList || !this.input) {
      return;
    }
    const query = this.input.value.trim().toLowerCase();
    this.resultsList.innerHTML = '';
    if (!query) {
      this.resultsList.classList.remove('has-results');
      return;
    }

    const matches = this.items
      .filter((item) => item.searchText.includes(query))
      .slice(0, MAX_RESULTS);

    if (matches.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'search-ctrl-empty';
      empty.textContent = 'No markers found';
      this.resultsList.appendChild(empty);
      this.resultsList.classList.add('has-results');
      return;
    }

    for (const match of matches) {
      const item = document.createElement('li');
      item.className = 'search-ctrl-result';

      const label = document.createElement('span');
      label.className = 'search-ctrl-result-label';
      label.textContent = match.label;
      item.appendChild(label);

      if (match.sublabel) {
        const sublabel = document.createElement('span');
        sublabel.className = 'search-ctrl-result-sublabel';
        sublabel.textContent = match.sublabel;
        item.appendChild(sublabel);
      }

      item.addEventListener('click', () => {
        this.onSelect(match.uuid);
        this.collapse();
      });
      this.resultsList.appendChild(item);
    }
    this.resultsList.classList.add('has-results');
  }
}
