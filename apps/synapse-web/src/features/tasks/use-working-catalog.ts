import { useMemo } from 'react';

import { type CatalogDocument, useActiveCatalog, useDraft } from '@/features/catalog';
import { type ApiError } from '@/lib';

import { changedTaskKeys } from './feature-list';

export type WorkingSource = { kind: 'draft'; activeVersion: number | null } | { kind: 'active'; version: number };

export type WorkingCatalog =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'none' }
  | { status: 'ready'; document: CatalogDocument; source: WorkingSource; changed: ReadonlySet<string> };

/** What every form edits: the shared draft when there is one, else the active version a first draft would start from. */
export function useWorkingCatalog(): WorkingCatalog {
  const active = useActiveCatalog();
  const draft = useDraft();
  const activeDocument = active.status === 'ready' ? active.document : null;
  const draftDocument = draft.status === 'ready' ? (draft.draft?.draft.document ?? null) : null;
  const changed = useMemo(() => changedTaskKeys(activeDocument, draftDocument), [activeDocument, draftDocument]);

  if (active.status === 'error') return { status: 'error', error: active.error };
  if (draft.status === 'error') return { status: 'error', error: draft.error };
  if (active.status === 'loading' || draft.status === 'loading') return { status: 'loading' };
  const activeVersion = active.status === 'ready' ? active.version : null;
  if (draftDocument) return { status: 'ready', document: draftDocument, source: { kind: 'draft', activeVersion }, changed };
  if (active.status === 'ready') return { status: 'ready', document: active.document, source: { kind: 'active', version: active.version }, changed };
  return { status: 'none' };
}
