# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev           # Vite dev server (http://localhost:5173)
npm run build         # tsc type-check, then vite build → dist/
npm run lint          # oxlint (correctness rules only, see .oxlintrc.json)
npm run format        # prettier --write . (single quotes, semicolons, trailing commas)
npm run format:check
```

There is no test suite. CI (`.github/workflows/npm-build.yml`) runs `lint`, `format:check` and `build`, so run all three before you finish. A husky pre-commit hook runs lint-staged, which runs oxlint and prettier on staged files.

The TypeScript config is strict about unused code (`noUnusedLocals`, `noUnusedParameters`) and uses `verbatimModuleSyntax` and `erasableSyntaxOnly`. So use `import type` for type-only imports, and don't use enums, namespaces or parameter properties.

## What this is

MapExplorer is an offline-capable React 19 PWA built on MapLibre (`@vis.gl/react-maplibre`), with MUI for the UI. On top of a basemap it draws two things:

- **Overlays**: raster tile maps, each with versions and "geo objects" (points of interest). They come from one or more **overlay servers** ([tileserve-go](https://github.com/Nils-witt/Tileserve-GO)). The client is `src/api/OverlayServer.ts`.
- **Units**: live positions with German tactical symbols (DV 102, rendered by `@taktische-zeichen/core` via `src/lib/unitSymbol.ts`). They come from one or more **unit servers** ([go-unit-mangement](https://github.com/Nils-witt/UnitManagement)). The client is `src/api/UnitServer.ts`. It loads the full list over REST and gets live updates over a WebSocket. Because browsers can't set headers on a WebSocket, the bearer token is sent as the subprotocols `['bearer', token]`.

Both API clients mirror the servers' OpenAPI specs; the comments in them name the schemas. When an API detail is unclear, check the server repos linked above.

## Architecture

**Runtime config.** The deployment serves `/config.json` (see `config.example.json`). It holds the map styles, overlay and unit server lists, and the OIDC issuer and client ID; there are no env overrides for these. It is loaded once through `loadAppConfig()` in `src/lib/config.ts`, and the service worker caches it with NetworkFirst so the app still starts offline. In dev, provide it as `public/config.json` (gitignored), or set `DEV_CONFIG_JSON_URL` to proxy it to a deployment's copy (the `devConfigJsonProxy` plugin in `vite.config.ts`). The only client env var is `VITE_DEFAULT_STYLE_URL`, a fallback for when config.json lists no styles.

**Auth.** `src/lib/oidc.ts` sets up authorization-code + PKCE through a single shared `UserManager` (oidc-client-ts). The session is stored in localStorage. Automatic silent renew is off. Instead, `renewOidcUser()` is driven by `AuthContext`, which serializes renewals across tabs with `navigator.locks` because of refresh-token rotation. If a renewal fails for a network reason, the app keeps the stale session so it can keep working offline. Routes: `/login` and `/login/callback` are public; everything else is behind `RequireAuth`.

**Provider stack** (`App.tsx` → `DataProviders.tsx`, a layout route so state survives navigation):
`AuthProvider` → `ConnectedServersProvider` → `OverlaysProvider` → `UnitsProvider` → `DisplaySettingsProvider`.

- `ConnectedServersContext` merges user-added servers with the servers the deployment configures. Configured servers get IDs of the form `configured-overlay-server:<url>` / `configured-unit-server:<url>`. A legacy bare-prefix ID is kept for backward compatibility. Servers can be disabled; use `isServerEnabled()`, since an unset `enabled` means enabled.
- `OverlaysContext` fetches the overlay list, versions and geo objects from every enabled server. It tracks which overlays are enabled, their draw order, opacity, and pinned version, and resolves them into `enabledOverlays` for the map.
- `UnitsContext` runs one `followServer()` loop per enabled unit server. The loop opens the WebSocket, loads the list, applies events that arrived in the meantime, and reconnects with exponential backoff. It reads the token through a ref so a token renewal doesn't tear down the streams.

**Persistence** (`src/lib/storage.ts`). Small settings live in localStorage under `mapexplorer.*` keys. Servers, cached overlay lists (with per-overlay user settings) and geo objects live in IndexedDB (`mapexplorer` DB). Providers first load from storage, then set a `loaded`/`cacheLoaded` flag, and only after that save state back. This keeps the empty initial state from overwriting stored data; keep this pattern. **When you add or change an IndexedDB store, bump `IDB_DATABASE_VERSION` and handle the upgrade in `openDb()`.** The existing stores are treated as caches and dropped instead of migrated.

**Map** (`src/components/MapView.tsx`). Overlay tiles are MapLibre raster sources with layer IDs `overlay-layer-<id>`. Draw order is enforced by calling `moveLayer`. `transformRequest` adds bearer tokens and reads current values through a ref, because MapLibre only reads it when the map is created. Custom map buttons are imperative MapLibre `IControl` classes in `src/controls/`, wrapped by React components in `src/components/mapControls/` using `useControl`. `SettingsDialog` is lazy-loaded.

**Service worker / offline.** `vite-plugin-pwa` generates a Workbox SW (`registerType: 'prompt'`; `UpdatePrompt` handles updates) with runtime caches for tiles, styles and config. Workbox tile routes must use function matchers, not bare RegExps, or cross-origin URLs won't match. `src/sw/custom.ts` is extra SW code that a small plugin in `vite.config.ts` bundles with rolldown into `/sw-custom.js`, which Workbox then loads with `importScripts`. In dev the plugin serves it on the fly. The custom SW serves overlay tiles from per-version caches named `<mapUuid>-<version>`. `src/lib/tileCache.ts` fills these caches when the user precaches an overlay from settings.

**Build metadata.** `__APP_VERSION__` and `__GIT_COMMIT__` are injected by Vite from the `APP_VERSION`/`GIT_COMMIT` env vars, falling back to git.

## Deployment

The `Dockerfile` builds the app and serves `dist/` with nginx (`nginx.conf`: SPA fallback, `no-cache` on SW files). The deployment has to provide `/config.json` next to the app.
