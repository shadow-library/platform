import { type ChipIntent } from '@/components/nf/StatusChip';

import { type FactResponse, type KnowledgeStatus, type MilestoneResponse, type UnlockTermSchema, type VolumeResponse } from './apis/api-types.gen';

export type TermKind = 'MILESTONE' | 'VOLUME' | 'CHAPTER' | 'ENDING';

export type TermState = 'reached' | 'planned' | 'open' | 'unknown';

export interface UnlockTermRow {
  kind: TermKind;
  label: string;
  state: TermState;
  status: string;
}

export type MilestoneLike = Pick<MilestoneResponse, 'milestoneKey' | 'label' | 'state' | 'plannedChapter' | 'reachedChapter'>;

export type VolumeLike = Pick<VolumeResponse, 'volumeKey' | 'ordinal' | 'title' | 'state'>;

export interface UnlockLookup {
  milestones: ReadonlyMap<string, MilestoneLike>;
  volumes: ReadonlyMap<string, VolumeLike>;
  /** The next chapter a draft may start at; a `chapter` term holds once the story has reached it. */
  nextChapter: number | undefined;
  /** Milestones, volumes and the next chapter are read separately; until they all arrive no term's state is known. */
  status: 'loading' | 'error' | 'ready';
}

export type SecretFact = Pick<FactResponse, 'knowledge' | 'unlock' | 'revealChapter' | 'plannedChapter' | 'disclosedInChapter' | 'allowedClues' | 'writerNote'>;

export const TERM_INTENT: Record<TermState, ChipIntent> = { reached: 'success', planned: 'accent', open: 'neutral', unknown: 'neutral' };

function milestoneRow(key: string, milestones: UnlockLookup['milestones']): UnlockTermRow {
  const milestone = milestones.get(key);
  if (!milestone) return { kind: 'MILESTONE', label: key, state: 'open', status: 'no such milestone' };
  if (milestone.state === 'reached') return { kind: 'MILESTONE', label: milestone.label, state: 'reached', status: `reached ch ${milestone.reachedChapter ?? '?'}` };
  if (milestone.state === 'planned') return { kind: 'MILESTONE', label: milestone.label, state: 'planned', status: `planned ch ${milestone.plannedChapter ?? '?'} · provisional` };
  return { kind: 'MILESTONE', label: milestone.label, state: 'open', status: 'open' };
}

function volumeRow(key: string, volumes: UnlockLookup['volumes']): UnlockTermRow {
  const volume = volumes.get(key);
  if (!volume) return { kind: 'VOLUME', label: key, state: 'open', status: 'no such volume' };
  const label = `Volume ${volume.ordinal}${volume.title?.trim() ? ` · ${volume.title.trim()}` : ''} has started`;
  return volume.state === 'not_started' ? { kind: 'VOLUME', label, state: 'open', status: 'not yet' } : { kind: 'VOLUME', label, state: 'reached', status: 'met' };
}

function chapterRow(chapter: number, nextChapter: number | undefined): UnlockTermRow {
  const met = nextChapter !== undefined && nextChapter >= chapter;
  return { kind: 'CHAPTER', label: `From chapter ${chapter}`, state: met ? 'reached' : 'open', status: met ? 'met' : 'not yet' };
}

function unknownRow(term: UnlockTermSchema, status: string): UnlockTermRow {
  if (term.milestone !== undefined) return { kind: 'MILESTONE', label: term.milestone, state: 'unknown', status };
  if (term.volume !== undefined) return { kind: 'VOLUME', label: term.volume, state: 'unknown', status };
  if (term.chapter !== undefined) return { kind: 'CHAPTER', label: `From chapter ${term.chapter}`, state: 'unknown', status };
  return { kind: 'ENDING', label: 'The chapters that write the ending', state: 'open', status: 'at the ending' };
}

export function unlockTermRow(term: UnlockTermSchema, lookup: UnlockLookup): UnlockTermRow {
  if (lookup.status !== 'ready') return unknownRow(term, lookup.status === 'loading' ? 'checking…' : 'couldn’t check');
  if (term.milestone !== undefined) return milestoneRow(term.milestone, lookup.milestones);
  if (term.volume !== undefined) return volumeRow(term.volume, lookup.volumes);
  if (term.chapter !== undefined) return chapterRow(term.chapter, lookup.nextChapter);
  return { kind: 'ENDING', label: 'The chapters that write the ending', state: 'open', status: 'at the ending' };
}

export function unlockRows(fact: Pick<FactResponse, 'unlock'>, lookup: UnlockLookup): UnlockTermRow[] {
  return (fact.unlock?.all ?? []).map(term => unlockTermRow(term, lookup));
}

export type TermDraftKind = 'milestone' | 'volume' | 'chapter' | 'ending';

export interface TermDraft {
  kind: TermDraftKind;
  value: string;
}

export function termDrafts(fact: Pick<FactResponse, 'unlock'>): TermDraft[] {
  return (fact.unlock?.all ?? []).map(term => {
    if (term.milestone !== undefined) return { kind: 'milestone', value: term.milestone };
    if (term.volume !== undefined) return { kind: 'volume', value: term.volume };
    if (term.chapter !== undefined) return { kind: 'chapter', value: String(term.chapter) };
    return { kind: 'ending', value: '' };
  });
}

/** The unlock the drafts describe, or `undefined` while any row is unfinished; an empty list clears the condition. */
export function termsFromDrafts(drafts: readonly TermDraft[]): UnlockTermSchema[] | undefined {
  const terms: UnlockTermSchema[] = [];
  for (const draft of drafts) {
    const value = draft.value.trim();
    if (draft.kind === 'ending') terms.push({ ending: true });
    else if (draft.kind === 'chapter' && /^\d+$/.test(value) && Number(value) >= 1) terms.push({ chapter: Number(value) });
    else if ((draft.kind === 'milestone' || draft.kind === 'volume') && value) terms.push({ [draft.kind]: value });
    else return undefined;
  }
  return terms;
}

/** Only a finalized chapter sets the reader's disclosure; planning never does. */
export function readerLearnsLine(fact: Pick<FactResponse, 'disclosedInChapter'>): string {
  return fact.disclosedInChapter != null ? `Since chapter ${fact.disclosedInChapter}.` : 'Not yet — set when the chapter that reveals it is final.';
}

export function plannedRevealLine(fact: Pick<FactResponse, 'plannedChapter' | 'revealChapter' | 'unlock'>): string {
  if (fact.plannedChapter != null) return `Planned for ch ${fact.plannedChapter} — provisional until you finalize that chapter.`;
  if (!fact.unlock?.all.length && fact.revealChapter == null) return 'No unlock and no date — no chapter plan may reveal it yet.';
  if (fact.revealChapter != null && fact.revealChapter > 1) return `No chapter plan claims it yet. Not before chapter ${fact.revealChapter}.`;
  return 'No chapter plan claims it yet. When one does, it shows here as planned for that chapter.';
}

/** A known fact reaches the writer whole; a locked one only through its cover note, or not at all. */
export function writerToldLine(fact: Pick<FactResponse, 'knowledge' | 'writerNote'>): string {
  if (fact.knowledge.length > 0) return 'It is open — the writer gets it in chapters told by someone who knows it.';
  return fact.writerNote?.trim() || 'Nothing — the writer doesn’t know this exists until it unlocks.';
}

export interface KnowerRow {
  entityKey: string;
  name: string;
  chapter: number;
  status: KnowledgeStatus;
  note: string | undefined;
  chip: string;
  intent: ChipIntent;
}

export function knowerRows(fact: Pick<FactResponse, 'knowledge'>): KnowerRow[] {
  return [...fact.knowledge]
    .sort((a, b) => a.learnedInChapter - b.learnedInChapter || a.entityName.localeCompare(b.entityName))
    .map(entry => ({
      entityKey: entry.entityKey,
      name: entry.entityName,
      chapter: entry.learnedInChapter,
      status: entry.status,
      note: entry.note?.trim() || undefined,
      chip: entry.status === 'provisional' ? `provisional — ch ${entry.learnedInChapter} not final` : 'confirmed',
      intent: entry.status === 'provisional' ? 'accent' : 'success',
    }));
}

export function allowedClues(fact: Pick<FactResponse, 'allowedClues'>): string[] {
  return (fact.allowedClues ?? []).map(clue => clue.trim()).filter(Boolean);
}

/** The list the server keeps: trimmed, blanks dropped, duplicates removed — so the page never shows a clue the save would discard. */
export function withClue(clues: readonly string[], clue: string): string[] {
  const next = clue.trim();
  if (!next || clues.includes(next)) return [...clues];
  return [...clues, next];
}

export function withoutClue(clues: readonly string[], index: number): string[] {
  return clues.filter((_, at) => at !== index);
}
