/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { SW_PROTOCOL, type SwRequest, type SwResponse } from './protocol';

/**
 * Defining types
 */
export interface RegisterServiceWorkerOptions {
  /** URL of the built service worker script. @default '/sw.js' */
  url?: string;
  /** Registration scope. @default the directory of `url` */
  scope?: string;
  /** `'module'` for an ES-module worker, `'classic'` otherwise. @default 'classic' */
  type?: 'classic' | 'module';
  /** Register immediately instead of waiting for the window `load` event (the default keeps startup fast). */
  immediate?: boolean;
  /** Reload the page when an applied update takes control. @default true */
  reloadOnUpdate?: boolean;
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  /** A new worker has installed and is waiting — surface a "refresh to update" prompt, then call `applyUpdate()`. */
  onUpdate?: (controller: ServiceWorkerController) => void;
  onActive?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: unknown) => void;
}

export interface MessageOptions {
  /** Called for each interim `progress` reply (e.g. per-URL while caching content) before the final result. */
  onProgress?: (response: SwResponse) => void;
  /** Reject if the worker doesn't reply within this many milliseconds. */
  timeoutMs?: number;
}

export interface ServiceWorkerController {
  readonly registration: ServiceWorkerRegistration | null;
  /** Check the server for a new worker. */
  update(): Promise<void>;
  unregister(): Promise<boolean>;
  /** Activate a waiting worker now (posts `skip-waiting`); the page reloads on `controllerchange` unless disabled. */
  applyUpdate(): void;
  /** Send a protocol request to the controlling worker and await its terminal reply. */
  message(request: SwRequest, options?: MessageOptions): Promise<SwResponse>;
}

/**
 * Declaring the constants
 */

/** Whether the current runtime can host a service worker (false during SSR and in unsupported browsers). */
export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Post a protocol request to a worker over a fresh `MessageChannel` and resolve with its terminal reply.
 * Interim `progress` replies are streamed to `onProgress`; `error` replies reject; the channel closes once settled.
 */
export function messageServiceWorker(target: ServiceWorker, request: SwRequest, options: MessageOptions = {}): Promise<SwResponse> {
  return new Promise<SwResponse>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = options.timeoutMs ? setTimeout(() => finish(() => reject(new Error('Service worker did not respond in time'))), options.timeoutMs) : undefined;

    function finish(settle: () => void): void {
      if (timer) clearTimeout(timer);
      channel.port1.onmessage = null;
      channel.port1.close();
      settle();
    }

    channel.port1.onmessage = (event: MessageEvent<SwResponse>) => {
      const response = event.data;
      if (response.type === 'progress') {
        options.onProgress?.(response);
        return;
      }
      finish(() => (response.type === 'error' ? reject(new Error(response.message)) : resolve(response)));
    };

    target.postMessage({ channel: SW_PROTOCOL, request } satisfies { channel: typeof SW_PROTOCOL; request: SwRequest }, [channel.port2]);
  });
}

/**
 * Register the app's service worker and return a controller for updates and messaging. SSR- and
 * unsupported-safe: it no-ops and returns an inert controller when there is no `serviceWorker` API, so it can
 * be called unconditionally at module top level.
 *
 * The update model is prompt-then-reload: a newly installed worker waits, `onUpdate` fires so the app can show
 * a refresh prompt, and only an explicit `applyUpdate()` activates it — the one-time reload happens on
 * `controllerchange` and is gated on that opt-in, so a first-visit `clients.claim()` never reloads the page.
 */
export function registerServiceWorker(options: RegisterServiceWorkerOptions = {}): ServiceWorkerController {
  let registration: ServiceWorkerRegistration | null = null;
  let updateApplied = false;

  const controller: ServiceWorkerController = {
    get registration() {
      return registration;
    },
    async update() {
      await registration?.update();
    },
    async unregister() {
      return (await registration?.unregister()) ?? false;
    },
    applyUpdate() {
      const waiting = registration?.waiting;
      if (!waiting) return;
      updateApplied = true;
      waiting.postMessage({ channel: SW_PROTOCOL, request: { type: 'skip-waiting' } });
    },
    message(request, messageOptions) {
      const target = navigator.serviceWorker.controller ?? registration?.active ?? registration?.waiting ?? null;
      if (!target) return Promise.reject(new Error('No active service worker to receive the message'));
      return messageServiceWorker(target, request, messageOptions);
    },
  };

  if (!isServiceWorkerSupported()) return controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateApplied) return;
    updateApplied = false;
    if (options.reloadOnUpdate !== false) window.location.reload();
  });

  const register = async (): Promise<void> => {
    try {
      registration = await navigator.serviceWorker.register(options.url ?? '/sw.js', { scope: options.scope, type: options.type });
      options.onRegistered?.(registration);
      // A worker already waiting at registration time (with a controller present) is a pending update.
      if (registration.waiting && navigator.serviceWorker.controller) options.onUpdate?.(controller);
      registration.addEventListener('updatefound', () => {
        const installing = registration?.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) options.onUpdate?.(controller);
          else if (installing.state === 'activated' && registration) options.onActive?.(registration);
        });
      });
    } catch (error) {
      options.onError?.(error);
    }
  };

  if (options.immediate || (typeof document !== 'undefined' && document.readyState === 'complete')) void register();
  else window.addEventListener('load', () => void register(), { once: true });

  return controller;
}
