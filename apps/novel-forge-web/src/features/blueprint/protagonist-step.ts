import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passText } from './engine-pass';

export const PROTAGONIST_TOPIC = 'protagonist';
export const PROTAGONIST_LEADS_MAX = 2;
export const PROTAGONIST_LINE_MAX = 200;
export const PROTAGONIST_NAME_MAX = 80;
export const PROTAGONIST_WRITER_LINE_MAX = 240;
export const PROTAGONIST_WHY_MAX = 400;

export interface ProtagonistLead {
  id: string;
  name: string;
  descriptor: string;
}

export interface ProtagonistVersion {
  id: string;
  leadId: string;
  lie: string;
  wound: string;
  want: string;
  need: string;
  change: string;
  chapterOne: string;
}

export interface ProtagonistRound {
  leads: ProtagonistLead[];
  versions: ProtagonistVersion[];
}

/** A round from a step version this build does not know reads as no options, never as a crash on a screen the author is looking at. */
export function parseProtagonistRound(round: BlueprintRoundResponse | null): ProtagonistRound {
  const options = round?.options as { leads?: unknown; versions?: unknown } | null;
  const leads = passList(options?.leads).flatMap(item => {
    const lead = item as Partial<ProtagonistLead>;
    return typeof lead.id === 'string' ? [{ id: lead.id, name: passText(lead.name), descriptor: passText(lead.descriptor) }] : [];
  });
  const versions = passList(options?.versions).flatMap(item => {
    const version = item as Partial<ProtagonistVersion>;
    if (typeof version.id !== 'string') return [];
    return [
      {
        id: version.id,
        leadId: passText(version.leadId),
        lie: passText(version.lie),
        wound: passText(version.wound),
        want: passText(version.want),
        need: passText(version.need),
        change: passText(version.change),
        chapterOne: passText(version.chapterOne),
      },
    ];
  });
  return { leads, versions };
}

export interface LeadDraft {
  /** The version the draft came from; dropped once the author rewrites the lie, which is what tells one version from another. */
  optionId?: string;
  name: string;
  descriptor: string;
  lie: string;
  wound: string;
  want: string;
  need: string;
  change: string;
  chapterOne: string;
}

export type LeadDrafts = Record<string, LeadDraft>;

export interface ProtagonistDraft {
  leads: LeadDrafts;
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export const EMPTY_PROTAGONIST_DRAFT: ProtagonistDraft = { leads: {}, why: EMPTY_ANCHORED_LINE, writerLine: EMPTY_ANCHORED_LINE };

export function chooseVersion(version: ProtagonistVersion, lead: ProtagonistLead | undefined): LeadDraft {
  return {
    optionId: version.id,
    name: lead?.name ?? '',
    descriptor: lead?.descriptor ?? '',
    lie: version.lie,
    wound: version.wound,
    want: version.want,
    need: version.need,
    change: version.change,
    chapterOne: version.chapterOne,
  };
}

export function editLead(draft: LeadDraft, patch: Partial<Omit<LeadDraft, 'optionId'>>): LeadDraft {
  const lie = patch.lie ?? draft.lie;
  const rewritten = lie.trim() !== draft.lie.trim();
  return { ...draft, ...patch, ...(rewritten ? { optionId: undefined } : {}) };
}

/** What the why and the writer line are about: the lie or lies being locked, since that is what the author is choosing between. */
export function protagonistAnchor(leads: LeadDrafts): string {
  return Object.values(leads)
    .map(lead => `${lead.name.trim()} — ${lead.lie.trim()}`)
    .join(' · ');
}

export interface ProtagonistLeadBody {
  optionId?: string;
  name: string;
  descriptor: string;
  lie: string;
  wound: string;
  want: string;
  need: string;
  change: string;
  chapterOne: string;
}

export interface ProtagonistSelectionBody {
  leads: ProtagonistLeadBody[];
  why?: string;
  writerLine: string;
}

const filled = (lead: LeadDraft): boolean =>
  [lead.name, lead.descriptor, lead.lie, lead.wound, lead.want, lead.need, lead.change, lead.chapterOne].every(value => value.trim().length > 0);

function leadBody(lead: LeadDraft): ProtagonistLeadBody {
  return {
    ...(lead.optionId ? { optionId: lead.optionId } : {}),
    name: lead.name.trim(),
    descriptor: lead.descriptor.trim(),
    lie: lead.lie.trim(),
    wound: lead.wound.trim(),
    want: lead.want.trim(),
    need: lead.need.trim(),
    change: lead.change.trim(),
    chapterOne: lead.chapterOne.trim(),
  };
}

/** Null until every part of every lead is filled in and the writer line belongs to the lie on screen: a half answer would lock as the whole one. */
export function buildProtagonistSelection(draft: ProtagonistDraft): ProtagonistSelectionBody | null {
  const leads = Object.values(draft.leads);
  if (leads.length === 0 || leads.length > PROTAGONIST_LEADS_MAX || !leads.every(filled)) return null;
  const anchor = protagonistAnchor(draft.leads);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  if (!writerLine) return null;
  const why = readAnchoredLine(draft.why, anchor).text.trim();
  return { leads: leads.map(leadBody), ...(why ? { why } : {}), writerLine };
}

/**
 * The lead already in the Notebook, read back so a revisit locks the whole answer. The version ids are dropped: they are round-local,
 * so what comes back is the author's own text.
 */
export function restoreProtagonistDraft(entries: LedgerEntryResponse[]): ProtagonistDraft | null {
  const decided = lockedDecision(entries, PROTAGONIST_TOPIC);
  if (!decided) return null;
  const leads: LeadDrafts = {};
  passList(decisionPayload(decided)['leads']).forEach((item, index) => {
    const lead = item as Partial<LeadDraft>;
    leads[`l${index + 1}`] = {
      name: passText(lead.name),
      descriptor: passText(lead.descriptor),
      lie: passText(lead.lie),
      wound: passText(lead.wound),
      want: passText(lead.want),
      need: passText(lead.need),
      change: passText(lead.change),
      chapterOne: passText(lead.chapterOne),
    };
  });
  const anchor = protagonistAnchor(leads);
  return { leads, why: anchorLine(decided.why ?? '', anchor), writerLine: anchorLine(decided.writerLine ?? '', anchor) };
}

/** The screen offers cards rather than a filled-in draft, so a new round starts from nothing until the author picks one. */
export function protagonistDraftFrom(): ProtagonistDraft {
  return EMPTY_PROTAGONIST_DRAFT;
}

/**
 * What survives a new round. Version ids are round-local: `pv1` of the round before names a different card now, so each lead's id is
 * resolved again against what is on screen and dropped when the lie it stood for is no longer offered. The author's text is never
 * touched — the cards to pick from are the new ones, and the lines keep their own anchors.
 */
export function nextProtagonistDraft(current: ProtagonistDraft, round: ProtagonistRound): ProtagonistDraft {
  const leads = Object.entries(current.leads).map(([leadId, lead]) => {
    const offered = round.versions.find(version => version.lie.trim() === lead.lie.trim());
    return [leadId, offered ? { ...lead, optionId: offered.id } : { ...lead, optionId: undefined }] as const;
  });
  return { ...current, leads: Object.fromEntries(leads) };
}
