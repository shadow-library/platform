import { queryOptions } from '@tanstack/react-query';

import { type LibraryItem, type LibraryListResponse } from './api-types.gen';
import { toLibraryEntry } from './library.api';
import { type ApiError, APIRequest } from './transport';
import { type LibraryEntry } from './types';

export interface SharedEntry extends LibraryEntry {
  visibility: LibraryItem['visibility'];
}

/**
 * Not local-first like the library: a share can be revoked, and a device mirror would keep showing a novel after the author took it back. Fetched fresh,
 * never persisted, empty for a guest.
 */

const sharedKeys = {
  all: ['shared'] as const,
};

export const sharedQueryOptions = (signedIn: boolean) =>
  queryOptions<SharedEntry[], ApiError>({
    queryKey: sharedKeys.all,
    enabled: signedIn,
    queryFn: async () => {
      const response = await APIRequest.get('/shared').timeout(10_000).execute<LibraryListResponse>();
      return (response.items ?? []).map(item => ({ ...toLibraryEntry(item), visibility: item.visibility }));
    },
  });
