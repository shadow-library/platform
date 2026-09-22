import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passStrings, passText, sameJson } from './engine-pass';

export const BRIEFS_TOPIC = 'briefs';
export const BRIEFS_NAME_MAX = 80;
export const BRIEFS_LINE_MAX = 240;
export const BRIEFS_WRITER_LINE_MAX = 240;
export const BRIEFS_WHY_MAX = 400;

export interface BriefScene {
  goal: string;
  obstacle: string;
  turn: string;
  beats: string[];
}

export interface BriefOption {
  id: string;
  chapter: number;
  title: string;
  pov: string;
  purpose: string;
  objective: string;
  scenes: BriefScene[];
  endsOn: string;
  mustNotResolve: string;
  cites: string[];
  learns: string[];
}

export interface BriefsRound {
  arcKey: string;
  arcTitle: string;
  chapterStart: number;
  chapterEnd: number;
  briefs: BriefOption[];
}

function passNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseScene(value: unknown): BriefScene {
  const scene = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return { goal: passText(scene['goal']), obstacle: passText(scene['obstacle']), turn: passText(scene['turn']), beats: passStrings(scene['beats']) };
}

export function parseBriefsRound(round: BlueprintRoundResponse | null): BriefsRound {
  const options = round?.options as Record<string, unknown> | null;
  const briefs = passList(options?.['briefs']).flatMap((item, index) => {
    const brief = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const id = passText(brief['id']);
    return id
      ? [
          {
            id,
            chapter: passNumber(brief['chapter'], index + 1),
            title: passText(brief['title']),
            pov: passText(brief['pov']),
            purpose: passText(brief['purpose']),
            objective: passText(brief['objective']),
            scenes: passList(brief['scenes']).map(parseScene),
            endsOn: passText(brief['endsOn']),
            mustNotResolve: passText(brief['mustNotResolve']),
            cites: passStrings(brief['cites']),
            learns: passStrings(brief['learns']),
          },
        ]
      : [];
  });
  return {
    arcKey: passText(options?.['arcKey']),
    arcTitle: passText(options?.['arcTitle']),
    chapterStart: passNumber(options?.['chapterStart'], briefs[0]?.chapter ?? 0),
    chapterEnd: passNumber(options?.['chapterEnd'], briefs.at(-1)?.chapter ?? 0),
    briefs,
  };
}

/** Every beat the chapter plans, in order — the scenes are how they were grouped, not what the author reads them as. */
export function briefBeats(brief: BriefOption | null): string[] {
  return (brief?.scenes ?? []).flatMap(scene => scene.beats).filter(Boolean);
}

const CITE_LABELS: Record<string, string> = { bible_doc: 'Page', entity: 'Card' };

export interface CiteChip {
  ref: string;
  kind: string;
  label: string;
}

/** A ref read as the author would name it: the page or card's own slug, spaced out, with the kind beside it. */
export function citeChip(ref: string): CiteChip {
  const at = ref.indexOf(':');
  const kind = at === -1 ? '' : ref.slice(0, at);
  const value = at === -1 ? ref : ref.slice(at + 1);
  const name = (value.includes('/') ? (value.split('/')[1] ?? value) : value).replace(/[_-]+/g, ' ').trim();
  return { ref, kind: CITE_LABELS[kind] ?? kind, label: name.charAt(0).toUpperCase() + name.slice(1) };
}

export interface BriefDraftRow {
  optionId?: string;
  chapter: number;
  title: string;
  pov: string;
  purpose: string;
}

export interface BriefsDraft {
  briefs: BriefDraftRow[];
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export function briefsAnchor(briefs: BriefDraftRow[]): string {
  return briefs
    .filter(brief => brief.title.trim())
    .map(brief => `${brief.chapter}:${brief.title.trim()}`)
    .join(' → ');
}

export function briefsDraftAnchor(draft: BriefsDraft): string {
  return briefsAnchor(committedBriefs(draft));
}

export function editBrief(briefs: BriefDraftRow[], index: number, patch: Partial<Omit<BriefDraftRow, 'optionId' | 'chapter'>>): BriefDraftRow[] {
  return briefs.map((brief, at) => (at === index ? { ...brief, ...patch } : brief));
}

/** Exactly the briefs a lock would carry; the blank rows a list helper is handed never reach the selection. */
export function committedBriefs(draft: BriefsDraft): BriefDraftRow[] {
  return draft.briefs.filter(brief => brief.title.trim() && brief.purpose.trim());
}

export function briefsLockIssue(draft: BriefsDraft, round: BriefsRound): string | null {
  const briefs = committedBriefs(draft);
  if (briefs.length === 0) return 'Every chapter needs a title and what it is for.';
  if (briefs.length !== draft.briefs.length) return 'Every chapter needs a title and what it is for.';
  const span = round.chapterEnd - round.chapterStart + 1;
  if (span > 0 && briefs.length !== span) return `Arc one runs ${span} chapters, and these briefs cover ${briefs.length}.`;
  if (!readAnchoredLine(draft.writerLine, briefsAnchor(briefs)).text.trim()) return 'Say what the shape of arc one means for whoever writes chapter one.';
  return null;
}

export interface BriefsSelectionBody {
  briefs: { optionId?: string; chapter: number; title: string; pov?: string; purpose: string }[];
  why?: string;
  writerLine: string;
}

export function buildBriefsSelection(draft: BriefsDraft, round: BriefsRound): BriefsSelectionBody | null {
  if (briefsLockIssue(draft, round)) return null;

  const briefs = committedBriefs(draft);
  const anchor = briefsAnchor(briefs);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  const why = readAnchoredLine(draft.why, anchor).text.trim();
  return {
    briefs: briefs.map(brief => ({
      ...(brief.optionId ? { optionId: brief.optionId } : {}),
      chapter: brief.chapter,
      title: brief.title.trim(),
      ...(brief.pov.trim() ? { pov: brief.pov.trim() } : {}),
      purpose: brief.purpose.trim(),
    })),
    ...(why ? { why } : {}),
    writerLine,
  };
}

export function briefsDraftFrom(round: BriefsRound): BriefsDraft {
  return {
    briefs: round.briefs.map(brief => ({ optionId: brief.id, chapter: brief.chapter, title: brief.title, pov: brief.pov, purpose: brief.purpose })),
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
  };
}

export function restoreBriefsDraft(entries: LedgerEntryResponse[]): BriefsDraft | null {
  const decided = lockedDecision(entries, BRIEFS_TOPIC);
  if (!decided) return null;

  const briefs = passList(decisionPayload(decided)['briefs']).map((item, index) => {
    const brief = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return { chapter: passNumber(brief['chapter'], index + 1), title: passText(brief['title']), pov: passText(brief['pov']), purpose: passText(brief['purpose']) };
  });
  const anchor = briefsAnchor(briefs);
  return { briefs, why: anchorLine(decided.why ?? '', anchor), writerLine: anchorLine(decided.writerLine ?? '', anchor) };
}

/**
 * Round-local ids name a place in the round, so a brief the author kept — or one read back from the notebook, which stores no ids at
 * all — is matched to the round on screen by its chapter. Without this a lock straight after a revisit carries no options, and the
 * server would read that as the author having dropped what those briefs declare.
 */
export function resolveBriefs(briefs: BriefDraftRow[], round: BriefsRound): BriefDraftRow[] {
  return briefs.map(brief => ({ ...brief, optionId: round.briefs.find(option => option.chapter === brief.chapter)?.id }));
}

export function resolveBriefsDraft(draft: BriefsDraft, round: BriefsRound): BriefsDraft {
  return { ...draft, briefs: resolveBriefs(draft.briefs, round) };
}

export function nextBriefsDraft(current: BriefsDraft, offered: BriefsDraft, round: BriefsRound): BriefsDraft {
  const fresh = briefsDraftFrom(round);
  return { briefs: sameJson(current.briefs, offered.briefs) ? fresh.briefs : resolveBriefs(current.briefs, round), why: current.why, writerLine: current.writerLine };
}

/** The chapter a "revise this brief" round names, as the round body the server takes. */
export function reviseBriefInput(chapter: number | null): { chapter: number } | undefined {
  return chapter === null ? undefined : { chapter };
}
