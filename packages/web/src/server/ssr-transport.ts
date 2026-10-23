import { type CsrfConfig } from '../lib/csrf';
import { type ServerFetch } from '../lib/transport';
import { createServerFetch } from './server-fetch';

export interface SsrTransportOptions {
  /** Origin used when neither `API_ORIGIN` nor `SERVER_URL` is set — the app's own local-dev default. */
  fallback?: string;
  /** CSRF cookie/header/TTL overrides; the defaults match every Shadow backend. */
  csrf?: CsrfConfig;
  /** Inbound headers relayed to the backend; defaults to the transport's own set (`user-agent`, `accept-language`, `x-forwarded-for`). */
  forwardHeaders?: string[];
}

export interface SsrTransport {
  serverFetch: ServerFetch;
}

const DEFAULT_BACKEND_ORIGIN = 'http://localhost:8080';

/** `API_ORIGIN` is the in-cluster Service DNS name the web tier calls directly, skipping the public ingress; `SERVER_URL` is identity-web's legacy name for it. */
export function resolveBackendOrigin(fallback?: string): string {
  return process.env.API_ORIGIN ?? process.env.SERVER_URL ?? fallback ?? DEFAULT_BACKEND_ORIGIN;
}

/** The `ssr` loader result for `createApiClient`; call it behind the app's `import.meta.env.SSR` guard, which cannot live in this prebuilt package. */
export function createSsrTransport(options: SsrTransportOptions = {}): SsrTransport {
  const serverFetch = createServerFetch({ baseUrl: resolveBackendOrigin(options.fallback), csrf: options.csrf, forwardHeaders: options.forwardHeaders });
  return { serverFetch };
}
