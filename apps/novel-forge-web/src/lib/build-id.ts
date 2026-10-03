declare const __BUILD_ID__: string;

/** Stamped by `define` in vite.config.ts, identically into the client bundle and the SSR server of one build. */
export const BUILD_ID: string = __BUILD_ID__;
