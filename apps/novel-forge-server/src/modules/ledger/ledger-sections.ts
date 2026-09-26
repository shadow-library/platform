import { PROGRESS_TOPIC_PREFIX } from '@server/common';
import { type Ledger } from '@server/database';

import { type ContextSection, type ContextSegment, renderSection } from '../ai/context/sections';
import { countTokens } from '../ai/context/token-budget';
import { type WriterDisclosurePolicy } from '../bible/fact/writer-disclosure-policy';

export type LedgerContextEntry = Pick<Ledger.Entry, 'kind' | 'topic' | 'statement' | 'why' | 'rejectedAlternatives' | 'writerLine' | 'decidedBy'>;

const DECIDED_KINDS: ReadonlySet<Ledger.Kind> = new Set(['decision', 'system']);
const EMPTY_LEDGER = 'Nothing has been decided yet.';

export const WRITER_LINES_BUDGET = 1_200;

/** The author's own notes, kept whole. They are too long to ride along with every decision, so the rendered ledger leaves them to the passes that read them. */
export const AUTHOR_BRIEF_TOPIC = 'start.brief';

/** One topic per suggested idea the author turned down, so recording it again supersedes the earlier scope. */
export const IDEA_TOPIC_PREFIX = 'idea.';

export function ideaTopic(ideaId: string): string {
  return `${IDEA_TOPIC_PREFIX}${ideaId}`;
}

/** Written only by the notes store, the progress checklist and idea rejections, never by the generic author-facing ledger routes. */
export function isReservedTopic(topic: string): boolean {
  return topic === AUTHOR_BRIEF_TOPIC || topic.startsWith(PROGRESS_TOPIC_PREFIX) || topic.startsWith(IDEA_TOPIC_PREFIX);
}

function tagged(entry: LedgerContextEntry): string {
  const why = entry.why ? ` — ${entry.why}` : '';
  return `- [${entry.topic}] ${entry.statement}${why}`;
}

function renderDecision(entry: LedgerContextEntry): string {
  const by = entry.decidedBy === 'system' ? ' (decided by the system)' : '';
  const lines = [`- ${entry.topic}${by}: ${entry.statement}`];
  if (entry.why) lines.push(`  Why: ${entry.why}`);
  if (entry.writerLine) lines.push(`  For the writer: ${entry.writerLine}`);
  return lines.join('\n');
}

function renderList(heading: string, lines: string[]): string | null {
  return lines.length === 0 ? null : `### ${heading}\n\n${lines.join('\n')}`;
}

/** Rejected ideas and the alternatives a decision passed over reach the model only as things never to offer again. */
function doNotPropose(entries: LedgerContextEntry[]): string[] {
  const rejected = entries.filter(entry => entry.kind === 'rejected').map(entry => `- ${entry.statement}${entry.why ? ` (the author's reason: ${entry.why})` : ''}`);
  const passedOver = entries
    .filter(entry => DECIDED_KINDS.has(entry.kind))
    .flatMap(entry => entry.rejectedAlternatives.map(alternative => `- ${alternative} (passed over for ${entry.topic})`));
  return [...rejected, ...passedOver];
}

export function renderLedger(all: LedgerContextEntry[]): string {
  const entries = all.filter(entry => entry.topic !== AUTHOR_BRIEF_TOPIC && !entry.topic.startsWith(PROGRESS_TOPIC_PREFIX));
  const blocks = [
    renderList('Decisions', entries.filter(entry => DECIDED_KINDS.has(entry.kind)).map(renderDecision)),
    renderList('Author directions', entries.filter(entry => entry.kind === 'direction').map(tagged)),
    renderList('Backlog — not yet', entries.filter(entry => entry.kind === 'backlog').map(tagged)),
    renderList('Do not propose', doNotPropose(entries)),
  ].filter((block): block is string => block !== null);
  return blocks.length === 0 ? EMPTY_LEDGER : blocks.join('\n\n');
}

/** Packs newest first, skipping any line too long for what is left, so an older short line can outlast a newer long one; kept lines read in ledger order. */
function selectWithinBudget(lines: string[], budgetTokens: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of [...lines].reverse()) {
    const cost = countTokens(`- ${line}\n`);
    if (used + cost > budgetTokens) continue;
    used += cost;
    kept.push(line);
  }
  return kept.reverse();
}

type WriterScrub = Pick<WriterDisclosurePolicy, 'scrub'>;

function scrubbedWriterLines(entries: LedgerContextEntry[], disclosure: WriterScrub): string[] {
  return entries
    .filter(entry => DECIDED_KINDS.has(entry.kind) && entry.writerLine)
    .map(entry => disclosure.scrub(entry.writerLine ?? '', 'writer_line').trim())
    .filter(Boolean);
}

function renderKept(kept: string[]): string | null {
  return kept.length === 0 ? null : kept.map(line => `- ${line}`).join('\n');
}

export function renderWriterLines(entries: LedgerContextEntry[], disclosure: WriterScrub, budgetTokens = WRITER_LINES_BUDGET): string | null {
  return renderKept(selectWithinBudget(scrubbedWriterLines(entries, disclosure), budgetTokens));
}

function requiredSection(key: string, content: string, segment: ContextSegment, sourceRefs: string[]): ContextSection {
  const rendered = renderSection(key, content);
  return { key, tier: 'approved_intent', segment, tokens: countTokens(rendered), truncated: false, sourceRefs, rendered, required: true };
}

function ledgerRefs(entries: LedgerContextEntry[]): string[] {
  return [...new Set(entries.map(entry => `ledger:${entry.topic}`))];
}

/** The active ledger carries the author's decisions and do-not-propose list, so it is required and never evicted to fit a budget. */
export function ledgerSection(entries: LedgerContextEntry[], segment: ContextSegment = 'stable'): ContextSection {
  return requiredSection(
    'ledger',
    renderLedger(entries),
    segment,
    ledgerRefs(entries.filter(entry => entry.topic !== AUTHOR_BRIEF_TOPIC && !entry.topic.startsWith(PROGRESS_TOPIC_PREFIX))),
  );
}

export function writerLinesSection(entries: LedgerContextEntry[], disclosure: WriterScrub): ContextSection | null {
  const lines = scrubbedWriterLines(entries, disclosure);
  const kept = selectWithinBudget(lines, WRITER_LINES_BUDGET);
  const content = renderKept(kept);
  if (content === null) return null;
  const withLines = entries.filter(entry => DECIDED_KINDS.has(entry.kind) && entry.writerLine);
  const section = requiredSection('writer_lines', content, 'volatile', ledgerRefs(withLines));
  return { ...section, truncated: kept.length < lines.length };
}
