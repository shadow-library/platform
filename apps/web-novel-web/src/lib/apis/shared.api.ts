/**
 * Importing npm packages
 */
import { queryOptions } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ServerLibraryItem, toLibraryEntry } from './library.api';
import { type ApiError, APIRequest } from './transport';
import { type LibraryEntry } from './types';

/**
 * Defining types
 *
 * `GET /api/shared` answers the same lean shelf shape as `GET /api/library`, plus the novel's
 * visibility, so the two render through one component.
 */
export interface ServerSharedItem extends ServerLibraryItem {
  visibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
}

interface ServerSharedList {
  items: ServerSharedItem[];
}

export interface SharedEntry extends LibraryEntry {
  visibility: ServerSharedItem['visibility'];
}

/**
 * Declaring the constants
 *
 * Novels shared *with* the reader — the only listing in the app that shows a non-public novel, and
 * the only way to reach one that is not a direct link. Deliberately not local-first like the
 * library: a share can be revoked, and a device mirror would keep showing a novel's title and cover
 * after the author took it back. It is fetched fresh, never persisted, and is empty for a guest.
 */

export const sharedKeys = {
  all: ['shared'] as const,
};

export const sharedQueryOptions = (signedIn: boolean) =>
  queryOptions<SharedEntry[], ApiError>({
    queryKey: sharedKeys.all,
    enabled: signedIn,
    queryFn: async () => {
      const response = await APIRequest.get('/shared').timeout(10_000).execute<ServerSharedList>();
      return (response.items ?? []).map(item => ({ ...toLibraryEntry(item), visibility: item.visibility }));
    },
  });
