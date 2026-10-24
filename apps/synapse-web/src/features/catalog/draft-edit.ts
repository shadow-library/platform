import { isApiError } from '@shadow-library/web';

import { type CatalogIssueResponse, type SaveDraftBody, type SaveDraftResponse } from '@/lib/apis/api-types.gen';
import { type CatalogWriteOutcome, isCatalogConflict } from '@/lib/apis/catalog-outcome';

import { type CatalogDocument, type DocumentEdit, draftExpectation } from './catalog-document';
import { isSameValue } from './catalog-values';

export type CatalogEdit = (document: CatalogDocument) => DocumentEdit;

export type DraftEditOutcome =
  | { kind: 'saved'; issues: CatalogIssueResponse[] }
  | { kind: 'invalid'; issues: CatalogIssueResponse[] }
  | { kind: 'unchanged' }
  | { kind: 'refused'; reason: string }
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string };

export interface DraftBase {
  document: CatalogDocument;
  /** `null` when there is no draft and the document is the active version's */
  fingerprint: string | null;
  /** With no draft, the active version the document came from */
  activeVersion?: number;
  note?: string;
}

export interface DraftEditPorts {
  loadBase: () => Promise<DraftBase>;
  save: (body: SaveDraftBody) => Promise<CatalogWriteOutcome<SaveDraftResponse>>;
}

const MAX_ATTEMPTS = 2;

function messageOf(error: unknown): string {
  return isApiError(error) || error instanceof Error ? error.message : 'The draft could not be saved';
}

async function attempt(ports: DraftEditPorts, edit: CatalogEdit, defaultNote: string): Promise<DraftEditOutcome> {
  let base: DraftBase;
  try {
    base = await ports.loadBase();
  } catch (error) {
    return { kind: 'failed', message: messageOf(error) };
  }
  const next = edit(base.document);
  if (!next.ok) return { kind: 'refused', reason: next.reason };
  if (isSameValue(next.document, base.document)) return { kind: 'unchanged' };
  const note = base.note?.trim() || defaultNote;
  try {
    const outcome = await ports.save({ document: next.document, note, ...draftExpectation(base.fingerprint, base.activeVersion) });
    return outcome.kind === 'done' ? { kind: 'saved', issues: outcome.value.issues } : { kind: 'invalid', issues: outcome.issues };
  } catch (error) {
    if (isCatalogConflict(error)) return { kind: 'conflict' };
    return { kind: 'failed', message: messageOf(error) };
  }
}

/** The edit is a pure function of the document, so re-applying it to a draft someone saved meanwhile is a rebase, not an overwrite. */
export async function runDraftEdit(ports: DraftEditPorts, edit: CatalogEdit, defaultNote: string): Promise<DraftEditOutcome> {
  let outcome: DraftEditOutcome = { kind: 'conflict' };
  for (let tries = 0; tries < MAX_ATTEMPTS && outcome.kind === 'conflict'; tries++) outcome = await attempt(ports, edit, defaultNote);
  return outcome;
}
