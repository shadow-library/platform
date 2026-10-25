import { isApiError } from '@shadow-library/web';

import { type AliasAction } from '@/features/aliases/alias-view';
import { type DraftAction } from '@/features/shared/draft-notice';
import { modelDisplayName } from '@/features/shared/model-options';
import { aliasName, modelName, providerName, taskTitle } from '@/features/shared/naming';
import { type CatalogIssueResponse, type SaveDraftBody, type SaveDraftResponse } from '@/lib/apis/api-types.gen';
import { type CatalogWriteOutcome, isCatalogConflict } from '@/lib/apis/catalog-outcome';

import { type CatalogDocument, type DocumentEdit, draftExpectation } from './catalog-document';
import { readAliases, readModels, readProviders, readTasks } from './catalog-readers';
import { type TaskEntry } from './catalog-spec.types';
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

/** The server's limit on a draft or version note. */
export const NOTE_MAX_LENGTH = 500;

export const FEATURE_NOTE_SECTIONS = ['details', 'effort', 'model names', 'data policy', 'routing'] as const;

export type FeatureNoteSection = (typeof FEATURE_NOTE_SECTIONS)[number];

const NOTE_SEPARATOR = '; ';

const NOTE_ACTIONS: Readonly<Record<DraftAction | AliasAction, true>> = { added: true, updated: true, removed: true, retargeted: true };

export function featureNote(task: Pick<TaskEntry, 'app' | 'name' | 'label'>, section: FeatureNoteSection): string {
  return `${taskTitle(task)}: ${section} updated`;
}

export interface GeneratedNotes {
  exact: ReadonlySet<string>;
  retargetPrefixes: readonly string[];
}

/**
 * Every note the screens could write about what the draft holds, built with the producers' own naming, so "Model pricing updated" or "Q4 refresh:
 * routing updated" stays a person's note. A note about something since removed from the draft no longer matches, so it stops growing.
 */
export function generatedNotesOf(document: CatalogDocument): GeneratedNotes {
  const actions = Object.keys(NOTE_ACTIONS);
  const models = readModels(document).flatMap(model => [modelName(model), modelDisplayName(model)]);
  const aliases = readAliases(document).map(alias => aliasName(alias));
  const entities = [
    ...readProviders(document).map(provider => `Provider ${providerName(provider.key)}`),
    ...models.map(name => `Model ${name}`),
    ...aliases.map(name => `Model name ${name}`),
  ];
  const features = readTasks(document).flatMap(task => FEATURE_NOTE_SECTIONS.map(section => featureNote(task, section)));
  return {
    exact: new Set([...entities.flatMap(entity => actions.map(action => `${entity} ${action}`)), ...features]),
    retargetPrefixes: aliases.map(name => `Model name ${name} now uses `),
  };
}

export function isGeneratedNote(note: string, known: GeneratedNotes): boolean {
  return note.split(NOTE_SEPARATOR).every(part => known.exact.has(part) || known.retargetPrefixes.some(prefix => part.startsWith(prefix) && part.length > prefix.length));
}

/** A person's note is kept as written; a console note grows to list every edit, so the draft's note describes all of its changes. */
export function nextDraftNote(current: string | undefined, defaultNote: string, known: GeneratedNotes): string {
  const note = current?.trim();
  if (!note) return defaultNote;
  if (!isGeneratedNote(note, known) || note.split(NOTE_SEPARATOR).includes(defaultNote)) return note;
  const combined = `${note}${NOTE_SEPARATOR}${defaultNote}`;
  return combined.length <= NOTE_MAX_LENGTH ? combined : `${combined.slice(0, NOTE_MAX_LENGTH - 1).trimEnd()}…`;
}

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
  const note = nextDraftNote(base.note, defaultNote, generatedNotesOf(base.document));
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
