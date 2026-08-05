import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import type { IControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

class VectorSourceControl implements IControl {
  private container?: HTMLDivElement;
  private map?: MapLibreMap;

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;

    const container = document.createElement('div');
    container.className =
      'maplibregl-ctrl maplibregl-ctrl-group vector-source-control';

    const form = document.createElement('form');
    form.className = 'vector-source-control__form';

    const input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'Vector style URL';
    input.value = DEFAULT_STYLE_URL;
    input.className = 'vector-source-control__input';

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Load';
    button.className = 'vector-source-control__button';

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const url = input.value.trim();
      if (url && this.map) {
        this.map.setStyle(url);
      }
    });

    form.append(input, button);
    container.append(form);
    this.container = container;

    return container;
  }

  onRemove(): void {
    this.container?.parentElement?.removeChild(this.container);
    this.map = undefined;
  }
}

export function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: DEFAULT_STYLE_URL,
      center: [7.09, 50.73],
      zoom: 10,
    });

    map.addControl(new NavigationControl(), 'top-left');
    map.addControl(new VectorSourceControl(), 'top-right');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={mapContainerRef} className="map" />;
}
