import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passStrings, passText, sameJson } from './engine-pass';

export const WORLD_RULES_TOPIC = 'world.rules';
export const WORLD_COST_TOPIC = 'world.cost';
export const WORLD_LINE_MAX = 200;
export const WORLD_TEXT_MAX = 600;
export const WORLD_WRITER_LINE_MAX = 240;
export const WORLD_WHY_MAX = 400;
export const WORLD_RULES_MAX = 6;

export interface CostRuleOption {
  id: string;
  rule: string;
  why: string;
  writerLine: string;
}

export interface WorldRuleOption {
  id: string;
  rule: string;
  why: string;
}

export interface WorldSociety {
  order: string;
  economy: string;
}

export interface WorldRound {
  summary: string;
  costRules: CostRuleOption[];
  rules: WorldRuleOption[];
  society: WorldSociety | null;
  /** Refused ideas these rules work around, quoted back so the coach is seen honouring them. */
  honoured: string[];
}

function parseSociety(value: unknown): WorldSociety | null {
  const society = value as Partial<WorldSociety> | null | undefined;
  if (typeof society?.order !== 'string' && typeof society?.economy !== 'string') return null;
  return { order: passText(society.order), economy: passText(society.economy) };
}

export function parseWorldRound(round: BlueprintRoundResponse | null): WorldRound {
  const options = round?.options as { summary?: unknown; costRules?: unknown; rules?: unknown; society?: unknown; honoured?: unknown } | null;
  const costRules = passList(options?.costRules).flatMap(item => {
    const cost = item as Partial<CostRuleOption>;
    return typeof cost.id === 'string' ? [{ id: cost.id, rule: passText(cost.rule), why: passText(cost.why), writerLine: passText(cost.writerLine) }] : [];
  });
  const rules = passList(options?.rules).flatMap(item => {
    const rule = item as Partial<WorldRuleOption>;
    return typeof rule.id === 'string' ? [{ id: rule.id, rule: passText(rule.rule), why: passText(rule.why) }] : [];
  });
  return { summary: passText(options?.summary), costRules, rules, society: parseSociety(options?.society), honoured: passStrings(options?.honoured) };
}

export interface CostDraft {
  optionId?: string;
  rule: string;
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export interface RuleDraft {
  optionId?: string;
  rule: string;
  why: string;
}

export interface WorldDraft {
  summary: string;
  cost: CostDraft;
  rules: RuleDraft[];
  society: WorldSociety | null;
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export const EMPTY_WORLD_DRAFT: WorldDraft = {
  summary: '',
  cost: { rule: '', why: EMPTY_ANCHORED_LINE, writerLine: EMPTY_ANCHORED_LINE },
  rules: [],
  society: null,
  why: EMPTY_ANCHORED_LINE,
  writerLine: EMPTY_ANCHORED_LINE,
};

export function chooseCostRule(option: CostRuleOption): CostDraft {
  return { optionId: option.id, rule: option.rule, why: anchorLine(option.why, option.rule), writerLine: anchorLine(option.writerLine, option.rule) };
}

/** Rewriting the rule makes it the author's own, and strands the two lines that were written about the wording they left behind. */
export function editCostRule(cost: CostDraft, rule: string): CostDraft {
  return { ...cost, rule, ...(rule.trim() === cost.rule.trim() ? {} : { optionId: undefined }) };
}

export function editRule(rules: RuleDraft[], index: number, patch: Partial<Omit<RuleDraft, 'optionId'>>): RuleDraft[] {
  const next = rules.map((rule, at) => {
    if (at !== index) return rule;
    const text = patch.rule ?? rule.rule;
    return { ...rule, ...patch, ...(text.trim() === rule.rule.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((rule, at) => rule.rule.trim().length > 0 || at === index);
}

export interface WorldSelectionBody {
  summary: string;
  cost: { optionId?: string; rule: string; why?: string; writerLine: string };
  rules: { optionId?: string; rule: string; why?: string }[];
  society?: WorldSociety;
  why?: string;
  writerLine: string;
}

export function buildWorldSelection(draft: WorldDraft): WorldSelectionBody | null {
  const summary = draft.summary.trim();
  const costRule = draft.cost.rule.trim();
  const rules = draft.rules.filter(rule => rule.rule.trim().length > 0).slice(0, WORLD_RULES_MAX);
  if (!summary || !costRule || rules.length === 0) return null;

  const costWriterLine = readAnchoredLine(draft.cost.writerLine, costRule).text.trim();
  const writerLine = readAnchoredLine(draft.writerLine, summary).text.trim();
  if (!costWriterLine || !writerLine) return null;

  const costWhy = readAnchoredLine(draft.cost.why, costRule).text.trim();
  const why = readAnchoredLine(draft.why, summary).text.trim();
  const society = draft.society;

  return {
    summary,
    cost: { ...(draft.cost.optionId ? { optionId: draft.cost.optionId } : {}), rule: costRule, ...(costWhy ? { why: costWhy } : {}), writerLine: costWriterLine },
    rules: rules.map(rule => ({ ...(rule.optionId ? { optionId: rule.optionId } : {}), rule: rule.rule.trim(), ...(rule.why.trim() ? { why: rule.why.trim() } : {}) })),
    ...(society && (society.order.trim() || society.economy.trim()) ? { society: { order: society.order.trim(), economy: society.economy.trim() } } : {}),
    ...(why ? { why } : {}),
    writerLine,
  };
}

export function worldDraftFrom(round: WorldRound): WorldDraft {
  const cost = round.costRules[0];
  return {
    summary: round.summary,
    cost: cost ? chooseCostRule(cost) : EMPTY_WORLD_DRAFT.cost,
    rules: round.rules.map(rule => ({ optionId: rule.id, rule: rule.rule, why: rule.why })),
    society: round.society,
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
  };
}

/** Both decisions this screen wrote, read back together: one lock writes the whole answer, so half of it on screen would retire the other half. */
export function restoreWorldDraft(entries: LedgerEntryResponse[]): WorldDraft | null {
  const cost = lockedDecision(entries, WORLD_COST_TOPIC);
  const rules = lockedDecision(entries, WORLD_RULES_TOPIC);
  if (!cost && !rules) return null;

  const costRule = cost?.statement ?? '';
  const summary = rules?.statement ?? '';
  const payload = decisionPayload(rules);
  return {
    summary,
    cost: { rule: costRule, why: anchorLine(cost?.why ?? '', costRule), writerLine: anchorLine(cost?.writerLine ?? '', costRule) },
    rules: passList(payload['rules']).map(item => {
      const rule = item as { rule?: unknown; why?: unknown };
      return { rule: passText(rule.rule), why: passText(rule.why) };
    }),
    society: parseSociety(payload['society']),
    why: anchorLine(rules?.why ?? '', summary),
    writerLine: anchorLine(rules?.writerLine ?? '', summary),
  };
}

function resolveCost(cost: CostDraft, round: WorldRound): CostDraft {
  return { ...cost, optionId: round.costRules.find(option => option.rule.trim() === cost.rule.trim())?.id };
}

function resolveRules(rules: RuleDraft[], round: WorldRound): RuleDraft[] {
  return rules.map(rule => ({ ...rule, optionId: round.rules.find(option => option.rule.trim() === rule.rule.trim())?.id }));
}

/**
 * What survives a new round, field by field: what the author never touched takes the round's new answer, and what they wrote or locked
 * stays theirs. Option ids are round-local, so `cr1` of the round before names a different rule now — the ids they keep are resolved
 * again by text against what is on screen, and dropped when the text is no longer offered.
 */
export function nextWorldDraft(current: WorldDraft, offered: WorldDraft, round: WorldRound): WorldDraft {
  const fresh = worldDraftFrom(round);
  return {
    summary: sameJson(current.summary, offered.summary) ? fresh.summary : current.summary,
    cost: sameJson(current.cost, offered.cost) ? fresh.cost : resolveCost(current.cost, round),
    rules: sameJson(current.rules, offered.rules) ? fresh.rules : resolveRules(current.rules, round),
    society: sameJson(current.society, offered.society) ? fresh.society : current.society,
    why: current.why,
    writerLine: current.writerLine,
  };
}
