/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type CsrfConfig } from '../lib/csrf';
import { type ServerFetch } from '../lib/transport';
import { createServerFetch } from './server-fetch';

/**
 * Defining types
 *
 * The composition layer that turns an app's entire SSR wiring into one expression. Each Shadow web app used
 * to hand-roll the same two steps in its own `ssr-transport.ts` — read the backend origin off the
 * environment, then hand it to `createServerFetch`. Both steps live here now, so an app's client
 * construction collapses to a single call behind its `import.meta.env.SSR` guard:
 *
 * ```ts
 * ssr: import.meta.env.SSR ? () => import('@shadow-library/web/server').then(m => m.createSsrTransport({ fallback: '...' })) : undefined,
 * ```
 *
 * The guard has to stay in app code: this package ships prebuilt, so Vite never gets to substitute
 * `import.meta.env.SSR` inside it and eliminate the server module graph from the client bundle.
 */
export interface SsrTransportOptions {
  /** Origin used when neither `API_ORIGIN` nor `SERVER_URL` is set — the app's own local-dev default. */
  fallback?: string;
  /** CSRF cookie/header/TTL overrides; the defaults match every Shadow backend. */
  csrf?: CsrfConfig;
  /** Inbound headers relayed to the backend; defaults to the transport's own set (`user-agent`, `accept-language`, `x-forwarded-for`). */
  forwardHeaders?: string[];
}

/** The SSR half of one transport, in the exact shape `createApiClient`'s `ssr` loader awaits and reads `.serverFetch` off. */
export interface SsrTransport {
  serverFetch: ServerFetch;
}

/**
 * Declaring the constants
 */

/** The platform gateway the SSR transport falls back to when neither an env var nor an app default names an origin. */
const DEFAULT_BACKEND_ORIGIN = 'http://localhost:8080';

/**
 * Resolve the backend origin the SSR transport reaches, centralising the env contract each app's
 * `ssr-transport.ts` used to hand-roll. `API_ORIGIN` is the canonical deploy-time variable — the in-cluster
 * Service DNS name the web tier calls directly, skipping the public ingress. `SERVER_URL` is honoured as
 * identity-web's historical fallback: it named the var first, before the platform settled on `API_ORIGIN`.
 * `fallback` is the app's own local-dev default; the shared default is the platform gateway.
 */
export function resolveBackendOrigin(fallback?: string): string {
  return process.env.API_ORIGIN ?? process.env.SERVER_URL ?? fallback ?? DEFAULT_BACKEND_ORIGIN;
}

/**
 * Compose {@link resolveBackendOrigin} and {@link createServerFetch} into the one SSR transport an app hands
 * `createApiClient`. It returns the `{ serverFetch }` shape the client's `ssr` loader awaits, so the whole of
 * an app's SSR wiring becomes a single call behind its `import.meta.env.SSR` guard.
 */
export function createSsrTransport(options: SsrTransportOptions = {}): SsrTransport {
  const serverFetch = createServerFetch({ baseUrl: resolveBackendOrigin(options.fallback), csrf: options.csrf, forwardHeaders: options.forwardHeaders });
  return { serverFetch };
}
