import { type BlueprintRoundResponse, type LedgerEntryResponse, type TitleChecksResponse } from '@/lib/apis';

import { type OptionVerdicts } from './round';

export const TITLE_TOPIC = 'title';
export const TITLE_RULED_OUT_TOPIC = 'title.ruled_out';
export const TITLE_TEXT_MAX = 120;
export const TITLE_SHORTLIST_MAX = 5;
export const TITLE_CHECK_BATCH_MAX = 8;

export interface TitleCandidate {
  id: string;
  text: string;
  /** The decision it came from, as the author would recognise it. */
  from: string;
}

export interface TitleGroup {
  style: string;
  label: string;
  titles: TitleCandidate[];
}

export function parseTitleGroups(round: BlueprintRoundResponse | null): TitleGroup[] {
  const options = round?.options as { groups?: unknown } | null;
  if (!Array.isArray(options?.groups)) return [];
  return options.groups.flatMap(candidate => {
    const group = candidate as { style?: unknown; label?: unknown; titles?: unknown };
    if (typeof group.style !== 'string' || !Array.isArray(group.titles)) return [];
    const titles = group.titles.flatMap(item => {
      const title = item as { id?: unknown; text?: unknown; from?: unknown };
      return typeof title.id === 'string' && typeof title.text === 'string' ? [{ id: title.id, text: title.text, from: typeof title.from === 'string' ? title.from : '' }] : [];
    });
    return titles.length === 0 ? [] : [{ style: group.style, label: typeof group.label === 'string' && group.label ? group.label : group.style, titles }];
  });
}

export function titleRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

export function titleCandidates(groups: TitleGroup[]): TitleCandidate[] {
  return groups.flatMap(group => group.titles);
}

export interface TitleDraft {
  /** The candidate the author took, or null while they are still looking. */
  workingId: string | null;
  /** A title the author typed instead of picking one. */
  ownTitle: string;
  starred: string[];
  /** What the author said about the candidates. It steers the next round and, for a `not`, becomes the rejection the lock writes. */
  verdicts: OptionVerdicts;
  why: string;
}

export const EMPTY_TITLE_DRAFT: TitleDraft = { workingId: null, ownTitle: '', starred: [], verdicts: {}, why: '' };

export function rejectedTitleIds(draft: TitleDraft): string[] {
  return Object.entries(draft.verdicts).flatMap(([optionId, verdict]) => (verdict.verdict === 'not' ? [optionId] : []));
}

export function toggleStar(starred: string[], titleId: string): string[] {
  if (starred.includes(titleId)) return starred.filter(id => id !== titleId);
  return starred.length >= TITLE_SHORTLIST_MAX ? starred : [...starred, titleId];
}

export function workingTitleText(draft: TitleDraft, candidates: TitleCandidate[]): string {
  const own = draft.ownTitle.trim();
  if (own) return own;
  return candidates.find(candidate => candidate.id === draft.workingId)?.text ?? '';
}

export interface TitleSelection {
  working: { optionId?: string; text: string };
  shortlist?: string[];
  rejected?: { optionId: string; reason: string }[];
  why?: string;
}

export function buildTitleSelection(draft: TitleDraft, candidates: TitleCandidate[]): TitleSelection | null {
  const own = draft.ownTitle.trim();
  const chosen = own ? undefined : candidates.find(candidate => candidate.id === draft.workingId);
  const text = (own || chosen?.text) ?? '';
  if (!text) return null;

  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const shortlist = draft.starred.flatMap(id => {
    const candidate = byId.get(id);
    return candidate && candidate.id !== chosen?.id ? [candidate.text] : [];
  });
  const rejected = Object.entries(draft.verdicts).flatMap(([optionId, verdict]) => {
    const reason = verdict.reason?.trim();
    return verdict.verdict === 'not' && byId.has(optionId) && optionId !== chosen?.id && reason ? [{ optionId, reason }] : [];
  });
  const why = draft.why.trim();
  return {
    working: { ...(chosen ? { optionId: chosen.id } : {}), text: text.slice(0, TITLE_TEXT_MAX) },
    ...(shortlist.length > 0 ? { shortlist: shortlist.slice(0, TITLE_SHORTLIST_MAX) } : {}),
    ...(rejected.length > 0 ? { rejected } : {}),
    ...(why ? { why } : {}),
  };
}

/** Every title the checks could speak to: what the author typed, plus the candidates they have not ruled out. */
export function checkableTitles(candidates: TitleCandidate[], draft: TitleDraft): string[] {
  const own = draft.ownTitle.trim();
  const ruledOut = new Set(rejectedTitleIds(draft));
  const offered = candidates.filter(candidate => !ruledOut.has(candidate.id)).map(candidate => candidate.text);
  return [...new Set([...(own ? [own] : []), ...offered])];
}

/** What one call takes. More than a batch on screen is said out loud rather than silently dropped — see `checkableTitles`. */
export function titlesToCheck(candidates: TitleCandidate[], draft: TitleDraft): string[] {
  return checkableTitles(candidates, draft).slice(0, TITLE_CHECK_BATCH_MAX);
}

export type TitleChecks = Record<string, TitleChecksResponse>;

export function indexChecks(results: TitleChecksResponse[]): TitleChecks {
  return Object.fromEntries(results.map(result => [result.title.trim().toLowerCase(), result]));
}

export function checksFor(checks: TitleChecks, title: string): TitleChecksResponse | null {
  return checks[title.trim().toLowerCase()] ?? null;
}

export interface RestoredTitle {
  workingTitle: string;
  starred: string[];
  ruledOut: { title: string; reason: string }[];
}

/** What the Notebook already holds for this step, so a revisit shows the working title it locked instead of an empty screen. */
export function restoreTitle(entries: LedgerEntryResponse[]): RestoredTitle {
  const locked = [...entries].reverse().find(entry => entry.topic === TITLE_TOPIC && entry.kind === 'decision');
  const payload = (locked?.payload ?? {}) as { shortlist?: unknown };
  const starred = Array.isArray(payload.shortlist) ? payload.shortlist.filter((title): title is string => typeof title === 'string') : [];
  const ruledOut = entries.filter(entry => entry.topic === TITLE_RULED_OUT_TOPIC && entry.kind === 'rejected').map(entry => ({ title: entry.statement, reason: entry.why ?? '' }));
  return { workingTitle: locked?.statement ?? '', starred, ruledOut };
}

const sameTitle = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * The draft a visit opens on: the title the Notebook already holds, the shortlist it kept, and the refusals it recorded shown
 * against whichever candidates this round happens to repeat. It is re-applied whenever the round changes, so a locked title picked
 * from a candidate cannot vanish when a new round renumbers the options — and whatever the author has touched wins over it.
 */
export function restoreTitleDraft(current: TitleDraft, entries: LedgerEntryResponse[], candidates: TitleCandidate[]): TitleDraft {
  const earlier = restoreTitle(entries);
  const picked = candidates.find(candidate => sameTitle(candidate.text, earlier.workingTitle));
  const refused = Object.fromEntries(
    candidates.flatMap(candidate => {
      const ruled = earlier.ruledOut.find(item => sameTitle(item.title, candidate.text));
      return ruled ? [[candidate.id, { verdict: 'not' as const, ...(ruled.reason ? { reason: ruled.reason } : {}) }]] : [];
    }),
  );
  return {
    workingId: current.workingId ?? picked?.id ?? null,
    ownTitle: current.ownTitle || (earlier.workingTitle && !picked ? earlier.workingTitle : ''),
    starred: [...new Set([...candidates.filter(candidate => earlier.starred.some(title => sameTitle(title, candidate.text))).map(candidate => candidate.id), ...current.starred])],
    verdicts: { ...refused, ...current.verdicts },
    why: current.why,
  };
}
