import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  cacheSavedDraft,
  catalogKeys,
  type CatalogWriteOutcome,
  draftQueryOptions,
  saveDraft,
  type SaveDraftBody,
  type SaveDraftResponse,
  versionQueryOptions,
  versionsQueryOptions,
} from '@/lib';

import { activeVersionOf, EMPTY_CATALOG } from './catalog-document';
import { type CatalogEdit, type DraftBase, type DraftEditOutcome, runDraftEdit } from './draft-edit';

export interface DraftEditor {
  apply: (edit: CatalogEdit, defaultNote: string) => Promise<DraftEditOutcome>;
  pending: boolean;
}

/** Always read fresh: the draft is shared, and an edit applied to a stale copy would silently revert someone else's save. */
async function loadDraftBase(queryClient: QueryClient): Promise<DraftBase> {
  const draft = await queryClient.fetchQuery({ ...draftQueryOptions(), staleTime: 0 });
  if (draft) return { document: draft.draft.document, fingerprint: draft.fingerprint, ...(draft.draft.note !== undefined && { note: draft.draft.note }) };
  const versions = await queryClient.fetchQuery({ ...versionsQueryOptions(), staleTime: 0 });
  const active = activeVersionOf(versions.items);
  const detail = active ? await queryClient.fetchQuery(versionQueryOptions(active.version)) : null;
  return detail ? { document: detail.document, fingerprint: null, activeVersion: detail.version } : { document: EMPTY_CATALOG, fingerprint: null };
}

export function useDraftEdit(): DraftEditor {
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState(0);

  const save = async (body: SaveDraftBody): Promise<CatalogWriteOutcome<SaveDraftResponse>> => {
    const saved = await saveDraft(body);
    if (saved.kind === 'done') cacheSavedDraft(queryClient, saved.value);
    return saved;
  };

  const apply = async (edit: CatalogEdit, defaultNote: string): Promise<DraftEditOutcome> => {
    setInFlight(count => count + 1);
    try {
      const outcome = await runDraftEdit({ loadBase: () => loadDraftBase(queryClient), save }, edit, defaultNote);
      if (outcome.kind === 'saved' || outcome.kind === 'conflict') await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      return outcome;
    } finally {
      setInFlight(count => count - 1);
    }
  };

  return { apply, pending: inFlight > 0 };
}
