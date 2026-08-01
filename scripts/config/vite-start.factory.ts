/**
 * Importing npm packages
 */
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type PluginOption, type ProxyOptions, type UserConfig } from 'vite';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface StartViteConfigOptions {
  /**
   * `resolve.alias` map. The caller must compute this itself (`fileURLToPath(new URL('./src', import.meta.url))`)
   * — `import.meta.url` inside this shared factory would resolve against the factory's own file, not the
   * calling app's directory, so the path can't be derived here.
   */
  alias?: Record<string, string>;
  /** Dev-server (and, when `mirrorProxyToPreview` is set, `vite preview`) proxy map — e.g. `{ '/api': { target, changeOrigin: true, secure: false } }`. */
  proxy?: Record<string, ProxyOptions>;
  /** Also apply `proxy` to `preview`. identity-web and web-novel-web need this (their OAuth/API redirects must stay same-origin in a preview build); novel-forge-web/pulse-web don't set `preview` at all. */
  mirrorProxyToPreview?: boolean;
  /** Extra plugins appended after `tanstackStart()` + `viteReact()` — e.g. an app's own opt-in bundle-analyzer, so this factory never has to depend on a plugin only some apps install. */
  plugins?: PluginOption[];
  /** Forwarded to `tanstackStart({ router: ... })` — novel-forge-web/pulse-web relocate the generated route tree under `generated/`. */
  routerOptions?: Parameters<typeof tanstackStart>[0] extends { router?: infer R } ? R : never;
  /** `ssr.noExternal` entries — novel-forge-web/pulse-web need `@shadow-library/ui` pulled into the SSR transform (see their own comment history: it reads `import.meta.env` in a static field initializer). */
  ssrNoExternal?: string[];
  /** `build.chunkSizeWarningLimit` override. */
  chunkSizeWarningLimit?: number;
  /** Dev/preview port. Every app currently uses 3000; kept overridable rather than hardcoded twice. */
  port?: number;
}

/**
 * Declaring the constants
 */
const DEFAULT_PORT = 3000;

/**
 * The shared TanStack Start + React Vite config shape every `ssr`-type web app in this monorepo used to
 * duplicate. Genuine per-app deltas (proxy targets, the opt-in analyzer, `ssr.noExternal`, the relocated
 * route-tree path) stay visible as options at the call site — see each app's own `vite.config.ts`.
 */
export function createStartViteConfig(options: StartViteConfigOptions = {}): UserConfig {
  const { alias, proxy, mirrorProxyToPreview, plugins = [], routerOptions, ssrNoExternal, chunkSizeWarningLimit, port = DEFAULT_PORT } = options;

  return defineConfig({
    plugins: [tanstackStart(routerOptions ? { router: routerOptions } : {}), viteReact(), ...plugins],
    ...(alias ? { resolve: { alias } } : {}),
    ...(ssrNoExternal ? { ssr: { noExternal: ssrNoExternal } } : {}),
    ...(chunkSizeWarningLimit ? { build: { chunkSizeWarningLimit } } : {}),
    server: { port, ...(proxy ? { proxy } : {}) },
    ...(mirrorProxyToPreview && proxy ? { preview: { proxy } } : {}),
  }) as UserConfig;
}
