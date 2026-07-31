/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * The message protocol shared by the client (`@shadow-library/web/pwa`) and the service worker
 * (`@shadow-library/web/service-worker`). Requests travel client → worker wrapped in an {@link SwEnvelope}
 * (so the worker ignores foreign `postMessage` traffic); replies travel back over the request's
 * `MessageChannel` port as an {@link SwResponse}, which lets a caller `await` a result and observe progress.
 */
export type SwRequest =
  | { type: 'skip-waiting' }
  | { type: 'cache-urls'; cacheName?: string; urls: string[] }
  | { type: 'delete-urls'; cacheName?: string; urls: string[] }
  | { type: 'delete-cache'; cacheName: string }
  | { type: 'list-urls'; cacheName?: string };

export type SwResponse =
  { type: 'progress'; completed: number; total: number; url: string } | { type: 'done'; cached?: number; urls?: string[] } | { type: 'error'; message: string };

export interface SwEnvelope {
  channel: typeof SW_PROTOCOL;
  request: SwRequest;
}

/**
 * Declaring the constants
 */

/** Tag stamped on every request envelope so the worker only reacts to this library's protocol. */
export const SW_PROTOCOL = 'shadow-pwa';
