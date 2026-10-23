// Requests travel client to worker wrapped in an `SwEnvelope`; replies come back over the request's `MessageChannel` port.
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

/** Stamped on every envelope so the worker ignores foreign `postMessage` traffic. */
export const SW_PROTOCOL = 'shadow-pwa';
