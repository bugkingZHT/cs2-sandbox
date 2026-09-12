/// <reference types="vite/client" />

/** Build-time application version from the latest Git tag reachable from HEAD. */
declare const __APP_VERSION__: string;

/** Injected by Vite define — current frontend version string */
declare const __FRONTEND_VERSION__: string;
