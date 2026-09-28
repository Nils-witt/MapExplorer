// The same palette as tileserve-go's frontend, so a layer without a color of
// its own looks the same there and here.
const LAYER_COLORS = [
  '#1976d2',
  '#ed6c02',
  '#2e7d32',
  '#9c27b0',
  '#00838f',
  '#c2185b',
  '#6d4c41',
  '#f9a825',
];

// The color of the layer at `index` in its version's layer list, so layers
// shown together stay distinguishable (colors repeat after eight).
export function layerColor(index: number): string {
  return LAYER_COLORS[index % LAYER_COLORS.length];
}
