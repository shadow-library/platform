import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passText, sameJson } from './engine-pass';

export const CAST_TOPIC = 'cast';
export const CAST_LADDER_TOPIC = 'cast.ladder';
export const CAST_NAME_MAX = 80;
export const CAST_LINE_MAX = 200;
export const CAST_WRITER_LINE_MAX = 240;
export const CAST_WHY_MAX = 400;
export const CAST_MEMBERS_MAX = 10;
export const LATER_CAST_MAX = 8;
export const CAST_LADDER_RUNGS_MAX = 6;

export type DecidedBy = 'author' | 'system';

export const DECIDED_BY_LABELS: Record<DecidedBy, string> = { author: 'You', system: 'System' };

export interface MemberOption {
  id: string;
  name: string;
  descriptor: string;
  role: string;
  wants: string;
  doesInVolumeOne: string;
  minor: boolean;
}

export interface LaterOption {
  id: string;
  name: string;
  line: string;
  volume: number;
}

export interface CastRungOption {
  id: string;
  name: string;
  meaning: string;
}

export interface CastLadder {
  first: string;
  second: string;
  rungs: CastRungOption[];
}

export interface CastRound {
  members: MemberOption[];
  later: LaterOption[];
  ladder: CastLadder | null;
}

function passNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseLadder(value: unknown): CastLadder | null {
  const ladder = value as { first?: unknown; second?: unknown; rungs?: unknown } | null | undefined;
  if (typeof ladder?.first !== 'string' && typeof ladder?.second !== 'string') return null;
  const rungs = passList(ladder?.rungs).flatMap(item => {
    const rung = item as Partial<CastRungOption>;
    return typeof rung.id === 'string' ? [{ id: rung.id, name: passText(rung.name), meaning: passText(rung.meaning) }] : [];
  });
  return { first: passText(ladder?.first), second: passText(ladder?.second), rungs };
}

export function parseCastRound(round: BlueprintRoundResponse | null): CastRound {
  const options = round?.options as { members?: unknown; later?: unknown; ladder?: unknown } | null;
  const members = passList(options?.members).flatMap(item => {
    const member = item as Partial<MemberOption>;
    return typeof member.id === 'string'
      ? [
          {
            id: member.id,
            name: passText(member.name),
            descriptor: passText(member.descriptor),
            role: passText(member.role),
            wants: passText(member.wants),
            doesInVolumeOne: passText(member.doesInVolumeOne),
            minor: member.minor === true,
          },
        ]
      : [];
  });
  const later = passList(options?.later).flatMap(item => {
    const member = item as Partial<LaterOption>;
    return typeof member.id === 'string' ? [{ id: member.id, name: passText(member.name), line: passText(member.line), volume: passNumber(member.volume, 2) }] : [];
  });
  return { members, later, ladder: parseLadder(options?.ladder) };
}

export interface MemberDraft {
  optionId?: string;
  name: string;
  descriptor: string;
  role: string;
  wants: string;
  doesInVolumeOne: string;
  decidedBy: DecidedBy;
}

export interface LaterDraft {
  optionId?: string;
  name: string;
  line: string;
  volume: number;
}

export interface CastRungDraft {
  optionId?: string;
  name: string;
  meaning: string;
}

export interface LadderDraft {
  first: string;
  second: string;
  rungs: CastRungDraft[];
}

export interface CastDraft {
  members: MemberDraft[];
  later: LaterDraft[];
  ladder: LadderDraft;
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export const EMPTY_LADDER_DRAFT: LadderDraft = { first: '', second: '', rungs: [] };

export function castAnchor(members: MemberDraft[]): string {
  return members
    .filter(member => member.name.trim())
    .map(member => member.name.trim())
    .join(', ');
}

/** Renaming a card makes it the author's own; every other field is theirs to edit either way. */
export function editMember(members: MemberDraft[], index: number, patch: Partial<Omit<MemberDraft, 'optionId'>>): MemberDraft[] {
  const next = members.map((member, at) => {
    if (at !== index) return member;
    const name = patch.name ?? member.name;
    return { ...member, ...patch, ...(name.trim() === member.name.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((member, at) => member.name.trim().length > 0 || at === index);
}

/**
 * "Decide for me" is a detail decision: the card is kept, and the system is recorded as the one who settled it. Like `editMember` it is
 * handed the list on screen, which ends in the blank row offered for the next card — and unlike an edit it has no row to keep.
 */
export function delegateMember(members: MemberDraft[], index: number, decidedBy: DecidedBy): MemberDraft[] {
  return members.map((member, at) => (at === index ? { ...member, decidedBy } : member)).filter(member => member.name.trim().length > 0);
}

/** Exactly the cards a lock would carry: the screen anchors its lines to these, so what it shows and what it sends can never disagree. */
export function committedMembers(draft: CastDraft): MemberDraft[] {
  return draft.members.filter(member => member.name.trim() && member.descriptor.trim()).slice(0, CAST_MEMBERS_MAX);
}

export function castDraftAnchor(draft: CastDraft): string {
  return castAnchor(committedMembers(draft));
}

/** Why the lock is unavailable, in the author's words. `buildCastSelection` refuses exactly when this answers. */
export function castLockIssue(draft: CastDraft): string | null {
  const members = committedMembers(draft);
  if (members.length === 0) return 'Every card needs a name and a line saying who they are to the protagonist.';

  const names = members.map(member => member.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Two cards name the same character.';

  const ladder = draft.ladder;
  if (ladder.first.trim() && ladder.first.trim().toLowerCase() === ladder.second.trim().toLowerCase()) return 'The relationship ladder names the same person twice.';
  if (!readAnchoredLine(draft.writerLine, castAnchor(members)).text.trim()) return 'Say what this cast means for whoever writes chapter one.';
  return null;
}

export function editCastRung(rungs: CastRungDraft[], index: number, patch: Partial<Omit<CastRungDraft, 'optionId'>>): CastRungDraft[] {
  const next = rungs.map((rung, at) => {
    if (at !== index) return rung;
    const name = patch.name ?? rung.name;
    return { ...rung, ...patch, ...(name.trim() === rung.name.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((rung, at) => rung.name.trim().length > 0 || at === index);
}

export interface CastSelectionBody {
  members: { optionId?: string; name: string; descriptor: string; role?: string; wants?: string; doesInVolumeOne?: string; decidedBy: DecidedBy }[];
  later?: { optionId?: string; name: string; line: string; volume: number }[];
  ladder?: { first: string; second: string; rungs: { optionId?: string; name: string; meaning?: string }[] };
  why?: string;
  writerLine: string;
}

export function buildCastSelection(draft: CastDraft): CastSelectionBody | null {
  if (castLockIssue(draft)) return null;

  const members = committedMembers(draft);
  const anchor = castAnchor(members);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  const rungs = draft.ladder.rungs.filter(rung => rung.name.trim()).slice(0, CAST_LADDER_RUNGS_MAX);
  const ladder = draft.ladder.first.trim() && draft.ladder.second.trim() && rungs.length >= 2 ? draft.ladder : null;
  const later = draft.later.filter(member => member.name.trim() && member.line.trim()).slice(0, LATER_CAST_MAX);
  const why = readAnchoredLine(draft.why, anchor).text.trim();

  return {
    members: members.map(member => ({
      ...(member.optionId ? { optionId: member.optionId } : {}),
      name: member.name.trim(),
      descriptor: member.descriptor.trim(),
      ...(member.role.trim() ? { role: member.role.trim() } : {}),
      ...(member.wants.trim() ? { wants: member.wants.trim() } : {}),
      ...(member.doesInVolumeOne.trim() ? { doesInVolumeOne: member.doesInVolumeOne.trim() } : {}),
      decidedBy: member.decidedBy,
    })),
    ...(later.length > 0
      ? { later: later.map(member => ({ ...(member.optionId ? { optionId: member.optionId } : {}), name: member.name.trim(), line: member.line.trim(), volume: member.volume })) }
      : {}),
    ...(ladder
      ? {
          ladder: {
            first: ladder.first.trim(),
            second: ladder.second.trim(),
            rungs: rungs.map(rung => ({
              ...(rung.optionId ? { optionId: rung.optionId } : {}),
              name: rung.name.trim(),
              ...(rung.meaning.trim() ? { meaning: rung.meaning.trim() } : {}),
            })),
          },
        }
      : {}),
    ...(why ? { why } : {}),
    writerLine,
  };
}

export function castDraftFrom(round: CastRound): CastDraft {
  return {
    members: round.members.map(member => ({
      optionId: member.id,
      name: member.name,
      descriptor: member.descriptor,
      role: member.role,
      wants: member.wants,
      doesInVolumeOne: member.doesInVolumeOne,
      decidedBy: member.minor ? 'system' : 'author',
    })),
    later: round.later.map(member => ({ optionId: member.id, name: member.name, line: member.line, volume: member.volume })),
    ladder: round.ladder
      ? { first: round.ladder.first, second: round.ladder.second, rungs: round.ladder.rungs.map(rung => ({ optionId: rung.id, name: rung.name, meaning: rung.meaning })) }
      : EMPTY_LADDER_DRAFT,
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
  };
}

export function restoreCastDraft(entries: LedgerEntryResponse[]): CastDraft | null {
  const cast = lockedDecision(entries, CAST_TOPIC);
  const ladder = lockedDecision(entries, CAST_LADDER_TOPIC);
  if (!cast && !ladder) return null;

  const payload = decisionPayload(cast);
  const members = passList(payload['members']).map(item => {
    const member = item as { name?: unknown; descriptor?: unknown; role?: unknown; wants?: unknown; doesInVolumeOne?: unknown; decidedBy?: unknown };
    return {
      name: passText(member.name),
      descriptor: passText(member.descriptor),
      role: passText(member.role),
      wants: passText(member.wants),
      doesInVolumeOne: passText(member.doesInVolumeOne),
      decidedBy: member.decidedBy === 'system' ? ('system' as const) : ('author' as const),
    };
  });
  const later = passList(payload['later']).map(item => {
    const member = item as { name?: unknown; line?: unknown; volume?: unknown };
    return { name: passText(member.name), line: passText(member.line), volume: passNumber(member.volume, 2) };
  });

  const ladderPayload = decisionPayload(ladder);
  const anchor = castAnchor(members);
  return {
    members,
    later,
    ladder: {
      first: passText(ladderPayload['first']),
      second: passText(ladderPayload['second']),
      rungs: passList(ladderPayload['rungs']).map(item => {
        const rung = item as { name?: unknown; meaning?: unknown };
        return { name: passText(rung.name), meaning: passText(rung.meaning) };
      }),
    },
    why: anchorLine(cast?.why ?? '', anchor),
    writerLine: anchorLine(cast?.writerLine ?? '', anchor),
  };
}

function resolveMembers(members: MemberDraft[], round: CastRound): MemberDraft[] {
  return members.map(member => ({ ...member, optionId: round.members.find(option => option.name.trim() === member.name.trim())?.id }));
}

function resolveLater(later: LaterDraft[], round: CastRound): LaterDraft[] {
  return later.map(member => ({ ...member, optionId: round.later.find(option => option.name.trim() === member.name.trim())?.id }));
}

function resolveLadder(ladder: LadderDraft, round: CastRound): LadderDraft {
  return { ...ladder, rungs: ladder.rungs.map(rung => ({ ...rung, optionId: round.ladder?.rungs.find(option => option.name.trim() === rung.name.trim())?.id })) };
}

/** What survives a new round: untouched lists take the new one, and what the author wrote or locked keeps its text with its ids re-resolved. */
export function nextCastDraft(current: CastDraft, offered: CastDraft, round: CastRound): CastDraft {
  const fresh = castDraftFrom(round);
  return {
    members: sameJson(current.members, offered.members) ? fresh.members : resolveMembers(current.members, round),
    later: sameJson(current.later, offered.later) ? fresh.later : resolveLater(current.later, round),
    ladder: sameJson(current.ladder, offered.ladder) ? fresh.ladder : resolveLadder(current.ladder, round),
    why: current.why,
    writerLine: current.writerLine,
  };
}
