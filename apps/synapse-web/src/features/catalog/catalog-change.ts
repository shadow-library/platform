import { isApiError } from '@shadow-library/web';

import { type ApplyChangeBody, type CatalogIssueResponse, type CatalogVersionSummaryResponse } from '@/lib/apis/api-types.gen';
import { type CatalogWriteOutcome, isCatalogConflict, isForbidden } from '@/lib/apis/catalog-outcome';

import { type CatalogChange, describeChanges } from './catalog-changes';
import { type CatalogDocument, type DocumentEdit } from './catalog-document';
import { isSameValue } from './catalog-values';

export type CatalogEdit = (document: CatalogDocument) => DocumentEdit;

export interface LiveCatalog {
  /** `null` until a first version goes live */
  version: number | null;
  document: CatalogDocument;
}

export type ChangePreview =
  | { kind: 'ready'; base: LiveCatalog; after: CatalogDocument; changes: CatalogChange[] }
  | { kind: 'unchanged' }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; message: string };

export type ChangeOutcome =
  | { kind: 'applied'; version: number; previous: number | null }
  | { kind: 'invalid'; issues: CatalogIssueResponse[] }
  | { kind: 'unchanged' }
  | { kind: 'refused'; reason: string }
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string };

export interface CatalogChangePorts {
  loadLive: () => Promise<LiveCatalog>;
  apply: (body: ApplyChangeBody) => Promise<CatalogWriteOutcome<CatalogVersionSummaryResponse>>;
}

/** synapse-server's limit on a version note. */
export const NOTE_MAX_LENGTH = 500;

export const NOT_ALLOWED = "Your role isn't allowed to make this change. Ask a Synapse administrator if you need it.";

const MAX_ATTEMPTS = 2;

const NOTE_SEPARATOR = '; ';

const ELLIPSIS = '…';

export function changeErrorMessage(error: unknown): string {
  return isApiError(error) || error instanceof Error ? error.message : 'Synapse could not be reached';
}

export function previewChange(base: LiveCatalog, edit: CatalogEdit): Exclude<ChangePreview, { kind: 'failed' }> {
  const next = edit(base.document);
  if (!next.ok) return { kind: 'refused', reason: next.reason };
  if (isSameValue(next.document, base.document)) return { kind: 'unchanged' };
  return { kind: 'ready', base, after: next.document, changes: describeChanges(base.version === null ? null : base.document, next.document) };
}

/** Cuts on a code point, never inside a surrogate pair, and stays within the limit however the server counts. */
export function truncateNote(note: string): string {
  if (note.length <= NOTE_MAX_LENGTH) return note;
  let kept = '';
  for (const character of note) {
    if (kept.length + character.length >= NOTE_MAX_LENGTH) break;
    kept += character;
  }
  return `${kept.trimEnd()}${ELLIPSIS}`;
}

export function changeNote(changes: readonly Pick<CatalogChange, 'sentence'>[]): string {
  const sentences = changes.map(change => change.sentence);
  const whole = sentences.join(NOTE_SEPARATOR);
  if (whole.length <= NOTE_MAX_LENGTH) return whole;
  for (let kept = sentences.length - 1; kept > 0; kept--) {
    const rest = sentences.length - kept;
    const note = `${sentences.slice(0, kept).join(NOTE_SEPARATOR)}${NOTE_SEPARATOR}and ${rest} more ${rest === 1 ? 'change' : 'changes'}`;
    if (note.length <= NOTE_MAX_LENGTH) return note;
  }
  return truncateNote(whole);
}

async function attempt(ports: CatalogChangePorts, edit: CatalogEdit, note: string, known?: LiveCatalog): Promise<ChangeOutcome> {
  let base: LiveCatalog;
  try {
    base = known ?? (await ports.loadLive());
  } catch (error) {
    return { kind: 'failed', message: changeErrorMessage(error) };
  }
  const next = edit(base.document);
  if (!next.ok) return { kind: 'refused', reason: next.reason };
  if (isSameValue(next.document, base.document)) return { kind: 'unchanged' };
  try {
    const outcome = await ports.apply({ document: next.document, expectedVersion: base.version, ...(note && { note: truncateNote(note) }) });
    if (outcome.kind === 'invalid') return { kind: 'invalid', issues: outcome.issues };
    if (outcome.value.version === base.version) return { kind: 'unchanged' };
    return { kind: 'applied', version: outcome.value.version, previous: base.version };
  } catch (error) {
    if (isCatalogConflict(error)) return { kind: 'conflict' };
    if (isForbidden(error)) return { kind: 'refused', reason: NOT_ALLOWED };
    return { kind: 'failed', message: changeErrorMessage(error) };
  }
}

/** Edits compare-and-set the fields their form opened with, so re-running one on a version someone made live meanwhile cannot revert their change. */
export async function runCatalogChange(ports: CatalogChangePorts, edit: CatalogEdit, note: string, base?: LiveCatalog): Promise<ChangeOutcome> {
  let outcome = await attempt(ports, edit, note, base);
  for (let tries = 1; tries < MAX_ATTEMPTS && outcome.kind === 'conflict'; tries++) outcome = await attempt(ports, edit, note);
  return outcome;
}
