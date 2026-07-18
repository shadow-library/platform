/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type ServiceWorkerController } from '../pwa/register';
import { type OfflineEntryMeta, OfflineStore } from './offline-store';

/**
 * Defining types
 */
export interface DownloadProgress {
  /** `'data'` while the payload is fetched/stored, `'assets'` while asset URLs are cached, `'done'` at the end. */
  phase: 'data' | 'assets' | 'done';
  completed: number;
  total: number;
}

export interface DownloadOptions<T> {
  /** Stable id for this content (e.g. `novel:${id}`) — used to read it back and to remove it later. */
  key: string;
  label?: string;
  /** Fetches the payload to persist. Wire it to your API — e.g. `() => APIRequest.get('/novels/1').execute()`. */
  loader: () => Promise<T>;
  /** Asset URLs (images, fonts) to cache in the service worker so they resolve transparently offline. */
  assets?: string[];
  /** The controller from `registerServiceWorker`/`useServiceWorker`; required to cache `assets`. */
  controller?: ServiceWorkerController;
  onProgress?: (progress: DownloadProgress) => void;
}

export interface RemoveOptions {
  assets?: string[];
  controller?: ServiceWorkerController;
}

/**
 * Declaring the constants
 */

/**
 * Orchestrates downloading content for offline use: it persists the payload in the {@link OfflineStore}
 * (IndexedDB, works with no service worker) and, when given a controller and `assets`, asks the service worker
 * to cache those asset URLs so `<img src>` etc. resolve offline too. The two halves are independent — data
 * alone works everywhere; asset caching is a progressive enhancement when a worker is installed.
 */
export class OfflineContentManager {
  readonly store: OfflineStore;

  constructor(store: OfflineStore = new OfflineStore()) {
    this.store = store;
  }

  async download<T>(options: DownloadOptions<T>): Promise<OfflineEntryMeta> {
    options.onProgress?.({ phase: 'data', completed: 0, total: 1 });
    const data = await options.loader();
    const meta = await this.store.put(options.key, data, { label: options.label });
    options.onProgress?.({ phase: 'data', completed: 1, total: 1 });

    if (options.assets?.length && options.controller) {
      await options.controller.message(
        { type: 'cache-urls', urls: options.assets },
        {
          onProgress: response => {
            if (response.type === 'progress') options.onProgress?.({ phase: 'assets', completed: response.completed, total: response.total });
          },
        },
      );
    }

    options.onProgress?.({ phase: 'done', completed: 1, total: 1 });
    return meta;
  }

  async remove(key: string, options: RemoveOptions = {}): Promise<void> {
    await this.store.delete(key);
    if (options.assets?.length && options.controller) await options.controller.message({ type: 'delete-urls', urls: options.assets });
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key);
  }

  list(): Promise<OfflineEntryMeta[]> {
    return this.store.list();
  }
}
