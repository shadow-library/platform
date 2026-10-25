import { type ApiError } from '@/lib';

import { type CatalogDocument } from './catalog-document';
import { useActiveCatalog, useDraft } from './use-active-catalog';

export type WorkingSource = { kind: 'draft'; fingerprint: string; activeVersion: number | null } | { kind: 'active'; version: number };

export type WorkingCatalog =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'none' }
  | { status: 'ready'; document: CatalogDocument; source: WorkingSource; active: CatalogDocument | null };

/** What every form edits: the shared draft, else the active version a first draft starts from; `optional` shows a draft without waiting for the active one. */
export function useWorkingCatalog(published: 'required' | 'optional'): WorkingCatalog {
  const draft = useDraft();
  const saved = draft.status === 'ready' ? draft.draft : undefined;
  const active = useActiveCatalog(published === 'required' || saved === null);
  const activeDocument = active.status === 'ready' ? active.document : null;
  const activeVersion = active.status === 'ready' ? active.version : null;

  if (published === 'required' && active.status === 'error') return { status: 'error', error: active.error };
  if (draft.status === 'error') return { status: 'error', error: draft.error };
  if (saved === undefined || (published === 'required' && active.status === 'loading')) return { status: 'loading' };
  if (saved) return { status: 'ready', document: saved.draft.document, source: { kind: 'draft', fingerprint: saved.fingerprint, activeVersion }, active: activeDocument };
  if (active.status === 'loading') return { status: 'loading' };
  if (active.status === 'error') return { status: 'error', error: active.error };
  if (active.status === 'none') return { status: 'none' };
  return { status: 'ready', document: active.document, source: { kind: 'active', version: active.version }, active: active.document };
}
