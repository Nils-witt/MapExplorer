import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import './style.scss';
import { App } from './App.tsx';

// Light and dark schemes as CSS variables. The active one is set as
// data-mui-color-scheme on <html>, which the plain stylesheets (map controls,
// popups) key their dark styles on too.
const theme = createTheme({
  colorSchemes: { light: true, dark: true },
  cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' },
});

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      modeStorageKey="mapexplorer.colorMode"
      colorSchemeStorageKey="mapexplorer.colorScheme"
    >
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
