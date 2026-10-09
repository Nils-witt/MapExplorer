# MapExplorer

An offline-capable map viewer (PWA) built with React, MapLibre and MUI. It shows raster overlay maps and live unit positions with German tactical symbols on top of a configurable basemap.

## Key features

- **Overlay maps**: raster tile overlays from one or more [Tileserve-GO](https://github.com/Nils-witt/Tileserve-GO) servers, with versions, draw order, opacity and points of interest (geo objects).
- **Live units**: unit positions from one or more [UnitManagement](https://github.com/Nils-witt/UnitManagement) servers, updated live over WebSocket and drawn as tactical symbols (DV 102).
- **Offline use**: installable PWA. Overlays can be precached per version, and the app, styles and config keep working without a network connection.
- **Search**: find units and geo objects and jump to them on the map.
- **Flexible sign-in**: central SSO via OIDC (authorization code + PKCE), or per-server accounts when SSO is disabled.
- **Multiple servers**: combine servers configured by the deployment with servers users add themselves; enable or disable each one.
- **Light and dark mode**, including matching map styles.

## Getting started

```sh
npm install
cp config.example.json public/config.json   # fill in styles, servers and OIDC settings
npm run dev                                 # http://localhost:5173
```

Other commands: `npm run build`, `npm run lint`, `npm run format`.

## Configuration

The app loads `/config.json` at runtime (see `config.example.json`):

| Key              | Description                               |
| ---------------- | ----------------------------------------- |
| `mapStyles`      | Basemap styles (`name`, `url`)            |
| `overlayServers` | Tileserve-GO servers (`name`, `url`)      |
| `unitServers`    | UnitManagement servers (`name`, `url`)    |
| `ssoEnabled`     | `false` to use per-server sign-in instead |
| `oidcIssuer`     | OIDC issuer URL                           |
| `oidcClientId`   | OIDC client ID                            |

## Deployment

The `Dockerfile` builds the app and serves it with nginx. Images are published to GHCR on pushes to `main` and `v*` tags. Mount or provide `/config.json` next to the app.
