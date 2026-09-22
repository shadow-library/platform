import { type Ledger } from '@server/database';

import { type FactLike, scrubPlanForWriter } from '../../bible/fact/knowledge-view';
import { BLUEPRINT_PHASE_LABELS, BLUEPRINT_PHASES } from '../../blueprint/blueprint-phase';
import { type ContextSection, type ContextSegment, renderSection } from './sections';
import { countTokens } from './token-budget';

export type LedgerContextEntry = Pick<Ledger.Entry, 'kind' | 'phase' | 'topic' | 'statement' | 'why' | 'rejectedAlternatives' | 'writerLine' | 'decidedBy'>;

const DECIDED_KINDS: ReadonlySet<Ledger.Kind> = new Set(['decision', 'system']);
const UNPHASED_LABEL = 'Project';
const EMPTY_LEDGER = 'Nothing has been decided yet.';

export const WRITER_LINES_BUDGET = 1_200;

interface WriterLine {
  phase: Ledger.Phase | null;
  line: string;
}

function phaseRank(phase: Ledger.Phase | null): number {
  return phase === null ? BLUEPRINT_PHASES.length : BLUEPRINT_PHASES.indexOf(phase);
}

function byPhase<T extends Pick<Ledger.Entry, 'phase'>>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => phaseRank(a.entry.phase) - phaseRank(b.entry.phase) || a.index - b.index)
    .map(({ entry }) => entry);
}

function phaseLabel(phase: Ledger.Phase | null): string {
  return phase === null ? UNPHASED_LABEL : BLUEPRINT_PHASE_LABELS[phase];
}

function tagged(entry: LedgerContextEntry): string {
  const tag = entry.phase === null ? entry.topic : `${phaseLabel(entry.phase)} · ${entry.topic}`;
  const why = entry.why ? ` — ${entry.why}` : '';
  return `- [${tag}] ${entry.statement}${why}`;
}

function renderDecision(entry: LedgerContextEntry): string {
  const by = entry.decidedBy === 'system' ? ' (decided by the system)' : '';
  const lines = [`- ${entry.topic}${by}: ${entry.statement}`];
  if (entry.why) lines.push(`  Why: ${entry.why}`);
  if (entry.writerLine) lines.push(`  For the writer: ${entry.writerLine}`);
  return lines.join('\n');
}

function renderDecisions(decisions: LedgerContextEntry[]): string | null {
  if (decisions.length === 0) return null;
  const groups = new Map<string, string[]>();
  for (const entry of byPhase(decisions)) {
    const label = phaseLabel(entry.phase);
    groups.set(label, [...(groups.get(label) ?? []), renderDecision(entry)]);
  }
  const blocks = [...groups].map(([label, lines]) => `**${label}**\n${lines.join('\n')}`);
  return `### Decisions\n\n${blocks.join('\n\n')}`;
}

function renderList(heading: string, lines: string[]): string | null {
  return lines.length === 0 ? null : `### ${heading}\n\n${lines.join('\n')}`;
}

/** Rejected ideas and the alternatives a decision passed over reach the model only as things never to offer again. */
function doNotPropose(entries: LedgerContextEntry[]): string[] {
  const rejected = byPhase(entries.filter(entry => entry.kind === 'rejected')).map(entry => `- ${entry.statement}${entry.why ? ` (the author's reason: ${entry.why})` : ''}`);
  const passedOver = byPhase(entries.filter(entry => DECIDED_KINDS.has(entry.kind))).flatMap(entry =>
    entry.rejectedAlternatives.map(alternative => `- ${alternative} (passed over for ${entry.topic})`),
  );
  return [...rejected, ...passedOver];
}

export function renderLedger(entries: LedgerContextEntry[]): string {
  const blocks = [
    renderDecisions(entries.filter(entry => DECIDED_KINDS.has(entry.kind))),
    renderList('Author directions', byPhase(entries.filter(entry => entry.kind === 'direction')).map(tagged)),
    renderList('Backlog — not yet', byPhase(entries.filter(entry => entry.kind === 'backlog')).map(tagged)),
    renderList('Do not propose', doNotPropose(entries)),
  ].filter((block): block is string => block !== null);
  return blocks.length === 0 ? EMPTY_LEDGER : blocks.join('\n\n');
}

/**
 * Round-robin over phases, newest decision first within each, so a long ledger keeps every phase's latest word within the cap instead
 * of spending it all on the earliest phases.
 */
function selectWithinBudget(lines: WriterLine[], budgetTokens: number): WriterLine[] {
  const queues = new Map<number, WriterLine[]>();
  for (const item of [...lines].reverse()) queues.set(phaseRank(item.phase), [...(queues.get(phaseRank(item.phase)) ?? []), item]);
  const ranks = [...queues.keys()].sort((a, b) => a - b);

  const kept = new Map<number, WriterLine[]>();
  let used = 0;
  for (let round = 0; ranks.some(rank => (queues.get(rank)?.length ?? 0) > round); round++) {
    for (const rank of ranks) {
      const item = queues.get(rank)?.[round];
      if (!item) continue;
      const cost = countTokens(`- ${item.line}\n`);
      if (used + cost > budgetTokens) continue;
      used += cost;
      kept.set(rank, [...(kept.get(rank) ?? []), item]);
    }
  }
  return ranks.flatMap(rank => kept.get(rank) ?? []);
}

function scrubbedWriterLines(entries: LedgerContextEntry[], forbidden: FactLike[]): WriterLine[] {
  return entries
    .filter(entry => DECIDED_KINDS.has(entry.kind) && entry.writerLine)
    .map(entry => ({ phase: entry.phase, line: scrubPlanForWriter(entry.writerLine ?? '', forbidden).trim() }))
    .filter(item => item.line);
}

function renderKept(kept: WriterLine[]): string | null {
  return kept.length === 0 ? null : kept.map(item => `- ${item.line}`).join('\n');
}

export function renderWriterLines(entries: LedgerContextEntry[], forbidden: FactLike[], budgetTokens = WRITER_LINES_BUDGET): string | null {
  return renderKept(selectWithinBudget(scrubbedWriterLines(entries, forbidden), budgetTokens));
}

function requiredSection(key: string, content: string, segment: ContextSegment, sourceRefs: string[]): ContextSection {
  const rendered = renderSection(key, content);
  return { key, tier: 'approved_intent', segment, tokens: countTokens(rendered), truncated: false, sourceRefs, rendered, required: true };
}

function ledgerRefs(entries: LedgerContextEntry[]): string[] {
  return [...new Set(entries.map(entry => `ledger:${entry.topic}`))];
}

/** The active ledger is what every Blueprint step builds on, so it is required and never evicted to fit a budget. */
export function ledgerSection(entries: LedgerContextEntry[], segment: ContextSegment = 'stable'): ContextSection {
  return requiredSection('ledger', renderLedger(entries), segment, ledgerRefs(entries));
}

export function writerLinesSection(entries: LedgerContextEntry[], forbidden: FactLike[]): ContextSection | null {
  const lines = scrubbedWriterLines(entries, forbidden);
  const kept = selectWithinBudget(lines, WRITER_LINES_BUDGET);
  const content = renderKept(kept);
  if (content === null) return null;
  const withLines = entries.filter(entry => DECIDED_KINDS.has(entry.kind) && entry.writerLine);
  const section = requiredSection('writer_lines', content, 'volatile', ledgerRefs(withLines));
  return { ...section, truncated: kept.length < lines.length };
}
