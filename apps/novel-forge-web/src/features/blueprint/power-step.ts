import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passText, sameJson } from './engine-pass';

export const POWER_TOPIC = 'world.power';
export const POWER_LINE_MAX = 200;
export const POWER_NAME_MAX = 80;
export const POWER_WRITER_LINE_MAX = 240;
export const POWER_WHY_MAX = 400;
export const LADDER_RUNGS_MAX = 7;

export interface LadderRung {
  id: string;
  name: string;
  buys: string;
  cost: string;
}

export interface PowerRound {
  rungs: LadderRung[];
  note: string;
}

export function parsePowerRound(round: BlueprintRoundResponse | null): PowerRound {
  const options = round?.options as { rungs?: unknown; note?: unknown } | null;
  const rungs = passList(options?.rungs).flatMap(item => {
    const rung = item as Partial<LadderRung>;
    return typeof rung.id === 'string' ? [{ id: rung.id, name: passText(rung.name), buys: passText(rung.buys), cost: passText(rung.cost) }] : [];
  });
  return { rungs, note: passText(options?.note) };
}

export interface RungDraft {
  optionId?: string;
  name: string;
  buys: string;
  cost: string;
}

export interface PowerDraft {
  rungs: RungDraft[];
  note: string;
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export const EMPTY_POWER_DRAFT: PowerDraft = { rungs: [], note: '', why: EMPTY_ANCHORED_LINE, writerLine: EMPTY_ANCHORED_LINE };

/** Renaming a rung makes it the author's own; what it buys and costs is theirs to edit either way. */
export function editRung(rungs: RungDraft[], index: number, patch: Partial<Omit<RungDraft, 'optionId'>>): RungDraft[] {
  const next = rungs.map((rung, at) => {
    if (at !== index) return rung;
    const name = patch.name ?? rung.name;
    return { ...rung, ...patch, ...(name.trim() === rung.name.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((rung, at) => rung.name.trim().length > 0 || at === index);
}

/** The ladder as one line, which is the statement the decision carries and what its lines are written about. */
export function ladderAnchor(rungs: RungDraft[]): string {
  return rungs
    .filter(rung => rung.name.trim())
    .map(rung => rung.name.trim())
    .join(' → ');
}

export interface PowerSelectionBody {
  rungs: { optionId?: string; name: string; buys: string; cost: string }[];
  note?: string;
  why?: string;
  writerLine: string;
}

export function buildPowerSelection(draft: PowerDraft): PowerSelectionBody | null {
  const rungs = draft.rungs.filter(rung => rung.name.trim().length > 0).slice(0, LADDER_RUNGS_MAX);
  if (rungs.length < 2 || !rungs.every(rung => rung.buys.trim() && rung.cost.trim())) return null;

  const anchor = ladderAnchor(rungs);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  if (!writerLine) return null;
  const why = readAnchoredLine(draft.why, anchor).text.trim();
  const note = draft.note.trim();

  return {
    rungs: rungs.map(rung => ({ ...(rung.optionId ? { optionId: rung.optionId } : {}), name: rung.name.trim(), buys: rung.buys.trim(), cost: rung.cost.trim() })),
    ...(note ? { note } : {}),
    ...(why ? { why } : {}),
    writerLine,
  };
}

export function powerDraftFrom(round: PowerRound): PowerDraft {
  return {
    rungs: round.rungs.map(rung => ({ optionId: rung.id, name: rung.name, buys: rung.buys, cost: rung.cost })),
    note: round.note,
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
  };
}

export function restorePowerDraft(entries: LedgerEntryResponse[]): PowerDraft | null {
  const decided = lockedDecision(entries, POWER_TOPIC);
  if (!decided) return null;
  const payload = decisionPayload(decided);
  const rungs = passList(payload['rungs']).map(item => {
    const rung = item as Partial<RungDraft>;
    return { name: passText(rung.name), buys: passText(rung.buys), cost: passText(rung.cost) };
  });
  const anchor = ladderAnchor(rungs);
  return { rungs, note: passText(payload['note']), why: anchorLine(decided.why ?? '', anchor), writerLine: anchorLine(decided.writerLine ?? '', anchor) };
}

function resolveRungs(rungs: RungDraft[], round: PowerRound): RungDraft[] {
  return rungs.map(rung => ({ ...rung, optionId: round.rungs.find(option => option.name.trim() === rung.name.trim())?.id }));
}

/**
 * What survives a new round: a ladder the author never touched takes the new one, and one they built or locked stays theirs with its
 * rung ids resolved again by name, since `rg1` of the round before names a different rung now.
 */
export function nextPowerDraft(current: PowerDraft, offered: PowerDraft, round: PowerRound): PowerDraft {
  const fresh = powerDraftFrom(round);
  return {
    rungs: sameJson(current.rungs, offered.rungs) ? fresh.rungs : resolveRungs(current.rungs, round),
    note: sameJson(current.note, offered.note) ? fresh.note : current.note,
    why: current.why,
    writerLine: current.writerLine,
  };
}
