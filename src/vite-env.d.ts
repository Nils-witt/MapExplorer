/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_STYLE_URL?: string;
  // Dev mode only.
  readonly VITE_OVERLAY_SERVER_URL?: string;
  readonly VITE_OVERLAY_SERVER_NAME?: string;
  readonly VITE_UNIT_SERVER_URL?: string;
  readonly VITE_UNIT_SERVER_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
