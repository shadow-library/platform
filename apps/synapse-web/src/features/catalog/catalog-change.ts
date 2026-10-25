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

export type RestorePreview = Extract<ChangePreview, { kind: 'ready' | 'unchanged' }> | { kind: 'conflict' };

export type ChangeOutcome =
  | { kind: 'applied'; version: number; previous: number | null }
  | { kind: 'invalid'; issues: CatalogIssueResponse[] }
  | { kind: 'unchanged' }
  | { kind: 'alreadyLive' }
  | { kind: 'refused'; reason: string }
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string };

type VersionOutcome = CatalogWriteOutcome<CatalogVersionSummaryResponse>;

export interface CatalogChangePorts {
  loadLive: () => Promise<LiveCatalog>;
  apply: (body: ApplyChangeBody) => Promise<VersionOutcome>;
}

export interface RestorePorts {
  loadLive: () => Promise<LiveCatalog>;
  rollback: (input: { version: number; expectedVersion: number }) => Promise<VersionOutcome>;
}

/** synapse-server's limit on a version note. */
export const NOTE_MAX_LENGTH = 500;

export const NOT_ALLOWED = "Your role isn't allowed to make this change. Ask a Synapse administrator if you need it.";

const NOTE_SEPARATOR = '; ';

const ELLIPSIS = '…';

export function changeErrorMessage(error: unknown): string {
  return isApiError(error) || error instanceof Error ? error.message : 'Synapse could not be reached';
}

/**
 * A compare-and-set that is also idempotent: when the live catalog already holds what the edit sets, as after a retry whose first response was lost,
 * it changes nothing instead of refusing; otherwise it applies only while `isAsOpened` holds.
 */
export function compareAndSet(edit: CatalogEdit, isAsOpened: (document: CatalogDocument) => boolean, reason: string): CatalogEdit {
  return document => {
    const next = edit(document);
    if (!next.ok || isSameValue(next.document, document) || isAsOpened(document)) return next;
    return { ok: false, reason };
  };
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
    return writeOutcome(await ports.apply({ document: next.document, expectedVersion: base.version, ...(note && { note: truncateNote(note) }) }), base.version);
  } catch (error) {
    return writeFailure(error);
  }
}

function writeOutcome(outcome: VersionOutcome, previous: number | null): ChangeOutcome {
  if (outcome.kind === 'invalid') return { kind: 'invalid', issues: outcome.issues };
  if (outcome.value.version === previous) return { kind: 'alreadyLive' };
  return { kind: 'applied', version: outcome.value.version, previous };
}

function writeFailure(error: unknown): ChangeOutcome {
  if (isCatalogConflict(error)) return { kind: 'conflict' };
  if (isForbidden(error)) return { kind: 'refused', reason: NOT_ALLOWED };
  return { kind: 'failed', message: changeErrorMessage(error) };
}

/**
 * Edits compare-and-set the fields their form opened with, so re-running one on a version someone made live meanwhile cannot revert their change; one
 * that finds nothing left to change there was already made, by an earlier try whose answer was lost or by someone else.
 */
export async function runCatalogChange(ports: CatalogChangePorts, edit: CatalogEdit, note: string, base?: LiveCatalog): Promise<ChangeOutcome> {
  const outcome = await attempt(ports, edit, note, base);
  if (outcome.kind !== 'conflict') return outcome;
  const retried = await attempt(ports, edit, note);
  return retried.kind === 'unchanged' ? { kind: 'alreadyLive' } : retried;
}

/** Checked against the live version the person saw, so restoring never reverts a change they haven't seen. */
export function previewRestore(live: LiveCatalog, target: CatalogDocument, expectedLive: number): RestorePreview {
  if (live.version !== expectedLive) return { kind: 'conflict' };
  if (isSameValue(target, live.document)) return { kind: 'unchanged' };
  return { kind: 'ready', base: live, after: target, changes: describeChanges(live.document, target) };
}

/** A conflict that finds the restored settings already live is an earlier try whose answer was lost, not someone else's change. */
export async function runRestore(ports: RestorePorts, version: number, target: CatalogDocument, expectedVersion: number): Promise<ChangeOutcome> {
  try {
    return writeOutcome(await ports.rollback({ version, expectedVersion }), expectedVersion);
  } catch (error) {
    const outcome = writeFailure(error);
    if (outcome.kind !== 'conflict') return outcome;
    const live = await ports.loadLive().catch(() => null);
    return live && isSameValue(live.document, target) ? { kind: 'alreadyLive' } : outcome;
  }
}
