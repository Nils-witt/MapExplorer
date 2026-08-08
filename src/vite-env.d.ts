/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
