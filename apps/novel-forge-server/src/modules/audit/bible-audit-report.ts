import { revealTermPattern } from '@server/common';
import { type BibleAuditEvidence, type BibleAuditFinding, type BibleAuditGroup } from '@server/database';

import { isWriterExcludedBibleDoc } from '../ai/context/bible-docs';
import { type BibleAuditOutput, type BibleContradictionOutput } from '../ai/schemas';
import { type FactLike } from '../bible/fact/knowledge-view';
import { type ChangeOp, changeSetRefs } from '../refinement/change-set';
import { contentTokens, normaliseForQuote, quoteFoundIn } from '../refinement/write-policy';

export interface AuditReportInput {
  coverage: BibleAuditOutput | null;
  contradictions: BibleContradictionOutput | null;
  /** What the contradiction pass read, by label; evidence may cite nothing else. */
  sources: ReadonlyMap<string, string>;
  existingRefs: ReadonlySet<string>;
  /** The fields of each record as the audit read it, by ref (a fact's truth under `body`): a fix is judged by what it adds to them. */
  current: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  secrets: readonly FactLike[];
}

export interface BuiltAuditReport {
  findings: BibleAuditFinding[];
  /** The one change-set the report stages as a card; every finding's `opIndexes` point into it. */
  changeSet: ChangeOp[];
}

export const SECRET_WITHHELD = 'The suggested fix would write a secret the reader has not been told into a page or record the chapter writer reads, so no card was staged for it.';
export const REVEAL_WITHHELD = 'The suggested fix would change when or how a secret is revealed, which only the author decides, so no card was staged for it.';
export const COLLISION_WITHHELD = 'Another finding already changes this page or record, so this change was not staged — keep that finding or run the audit again.';
export const EVIDENCE_WITHHELD = 'The quoted evidence does not show both sides of this contradiction, so no change was staged — check the sources yourself.';

const GROUP_ORDER: readonly BibleAuditGroup[] = ['contradiction', 'add', 'revise', 'remove'];
const GROUP_LABELS: Record<BibleAuditGroup, [string, string]> = {
  add: ['to add', 'to add'],
  revise: ['to revise', 'to revise'],
  remove: ['to remove', 'to remove'],
  contradiction: ['contradiction', 'contradictions'],
};
const MIN_TRUTH_TOKENS = 3;
const TRUTH_OVERLAP = 0.75;
const MIN_SIDES = 2;
const OP_KEY_FIELDS: ReadonlySet<string> = new Set(['op', 'section', 'slug', 'entityKey', 'type', 'factKey']);
const SENTENCE_BREAK = /(?<=[.!?。！？]["'”’)\]]*)\s+|\n+/;
const QUOTE_MARKS = /^["'\s]+|["'\s]+$/g;

type StageOutcome = { index: number } | { withheld: string };

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (value !== null && typeof value === 'object') return Object.values(value).map(textOf).join('\n');
  return '';
}

/** What an op puts where the chapter writer reads it. A secret's own body is its truth and stays out; any other fact's body can be revealed, so it counts. */
function writerVisibleText(op: ChangeOp, secretKeys: ReadonlySet<string>): string {
  if (op.op === 'bible_document.upsert') return isWriterExcludedBibleDoc({ section: op.section, slug: op.slug }) ? '' : textOf([op.body, op.frontmatter]);
  if (op.op === 'entity.upsert') return textOf([op.name, op.status, op.motivation, op.notes, op.body]);
  if (op.op === 'fact.upsert') return textOf([op.writerNote, op.allowedClues, secretKeys.has(op.factKey) ? null : op.body]);
  return '';
}

function sentencesOf(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence !== '');
}

function addedSentences(after: string, before: string): string[] {
  const existing = new Set(sentencesOf(before).map(normaliseForQuote));
  return sentencesOf(after).filter(sentence => !existing.has(normaliseForQuote(sentence)));
}

function termCount(term: string, text: string): number {
  const pattern = revealTermPattern(term, true);
  return pattern ? (text.match(pattern)?.length ?? 0) : 0;
}

/** Most of the truth's words in one sentence: a restatement a give-away term or a verbatim quote would miss. */
function sentenceRestatesTruth(secret: FactLike, sentence: string): boolean {
  const truth = new Set(contentTokens(secret.text));
  if (truth.size < MIN_TRUTH_TOKENS) return false;
  const written = new Set(contentTokens(sentence));
  return [...truth].filter(token => written.has(token)).length / truth.size >= TRUTH_OVERLAP;
}

/** The op with each field it writes holding the record's current value instead: what the same fields say before the fix. */
function currentOf(op: ChangeOp, current: Readonly<Record<string, unknown>> | undefined): ChangeOp {
  return Object.fromEntries(Object.entries(op).map(([field, value]) => [field, OP_KEY_FIELDS.has(field) ? value : current?.[field]])) as ChangeOp;
}

function addsSecret(secret: FactLike, after: string, before: string): boolean {
  if ((secret.terms ?? []).some(term => termCount(term, after) > termCount(term, before))) return true;
  if (quoteFoundIn(secret.text, after) && !quoteFoundIn(secret.text, before)) return true;
  return addedSentences(after, before).some(sentence => sentenceRestatesTruth(secret, sentence));
}

/**
 * Why an op must not reach a card: it adds a secret where the chapter writer reads it (a give-away term, the truth quoted, or most of its words in
 * one sentence), or it changes a secret's reveal, unlock or give-away terms. Only what the fix adds counts, so correcting a page that already
 * names a secret is not held against the fix.
 */
export function secretRisk(op: ChangeOp, secrets: readonly FactLike[], current?: Readonly<Record<string, unknown>>): string | null {
  const secretKeys = new Set(secrets.map(secret => secret.factKey));
  if (op.op === 'fact.upsert' && secretKeys.has(op.factKey) && (op.revealChapter !== undefined || op.unlock !== undefined || op.terms !== undefined)) return REVEAL_WITHHELD;
  const after = writerVisibleText(op, secretKeys);
  if (!after.trim()) return null;
  const before = writerVisibleText(currentOf(op, current), secretKeys);
  return secrets.some(secret => addsSecret(secret, after, before)) ? SECRET_WITHHELD : null;
}

function evidenceFor(evidence: readonly { ref: string; quote: string }[], sources: ReadonlyMap<string, string>): BibleAuditEvidence[] {
  const seen = new Set<string>();
  return evidence.flatMap(({ ref, quote }) => {
    const source = sources.get(ref);
    if (source === undefined) return [];
    const verified = quoteFoundIn(quote, source) ? quote : null;
    const key = `${ref}\u0000${verified ?? ''}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ref, quote: verified }];
  });
}

function spanIn(source: string, quote: string): [number, number] {
  const needle = normaliseForQuote(quote.replace(QUOTE_MARKS, ''));
  const start = normaliseForQuote(source).indexOf(needle);
  return [start, start + needle.length];
}

/** Two sides: verified quotes from two sources, or two quotes of one source that do not overlap. */
function showsBothSides(evidence: readonly BibleAuditEvidence[], sources: ReadonlyMap<string, string>): boolean {
  const quoted = evidence.filter((entry): entry is { ref: string; quote: string } => entry.quote !== null);
  if (new Set(quoted.map(entry => entry.ref)).size >= MIN_SIDES) return true;
  return quoted.some((a, i) =>
    quoted.slice(i + 1).some(b => {
      if (a.ref !== b.ref) return false;
      const source = sources.get(a.ref) ?? '';
      const [aStart, aEnd] = spanIn(source, a.quote);
      const [bStart, bEnd] = spanIn(source, b.quote);
      return aEnd <= bStart || bEnd <= aStart;
    }),
  );
}

function refOf(op: ChangeOp): string {
  return changeSetRefs([op])[0] ?? op.op;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${key}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function rationaleOf(op: ChangeOp): string | null {
  const rationale = (op as { rationale?: unknown }).rationale;
  return typeof rationale === 'string' && rationale.trim() ? rationale.trim() : null;
}

/**
 * Turns both passes into one report: contradictions with the evidence that survives checking against what was read, then coverage findings
 * grouped by what they ask for, and a single change-set every finding points into. An op that risks a secret, or that would change a record
 * another finding already changes differently, stays off the card and its finding says why.
 */
export function buildAuditReport(input: AuditReportInput): BuiltAuditReport {
  const changeSet: ChangeOp[] = [];
  const indexByRef = new Map<string, number>();
  const stage = (op: ChangeOp): StageOutcome => {
    const risk = secretRisk(op, input.secrets, input.current.get(refOf(op)));
    if (risk) return { withheld: risk };
    const existing = indexByRef.get(refOf(op));
    if (existing !== undefined) return canonical(changeSet[existing]) === canonical(op) ? { index: existing } : { withheld: COLLISION_WITHHELD };
    changeSet.push(op);
    indexByRef.set(refOf(op), changeSet.length - 1);
    return { index: changeSet.length - 1 };
  };
  const stageAll = (ops: readonly ChangeOp[]): Pick<BibleAuditFinding, 'opIndexes' | 'withheld'> => {
    const outcomes = ops.map(stage);
    const reasons = [...new Set(outcomes.flatMap(outcome => ('withheld' in outcome ? [outcome.withheld] : [])))];
    return { opIndexes: [...new Set(outcomes.flatMap(outcome => ('index' in outcome ? [outcome.index] : [])))], withheld: reasons.length > 0 ? reasons.join(' ') : null };
  };

  const drafts: Omit<BibleAuditFinding, 'id'>[] = [];
  for (const item of input.contradictions?.contradictions ?? []) {
    const evidence = evidenceFor(item.evidence, input.sources);
    if (!evidence.some(entry => entry.quote !== null)) continue;
    const ops = item.changeSet as unknown as ChangeOp[];
    const ref = ops[0] ? refOf(ops[0]) : ((evidence.find(entry => !entry.ref.startsWith('chapter:')) ?? evidence[0])?.ref ?? '');
    const staged = showsBothSides(evidence, input.sources) ? stageAll(ops) : { opIndexes: [], withheld: ops.length > 0 ? EVIDENCE_WITHHELD : null };
    drafts.push({ group: 'contradiction', ref, text: item.finding, evidence, ...staged });
  }

  if (input.coverage) {
    const coverageOps = input.coverage.changeSet as unknown as ChangeOp[];
    const claimed = new Set<ChangeOp>();
    for (const finding of input.coverage.findings) {
      if (finding.action === 'keep') continue;
      const ops = coverageOps.filter(op => refOf(op) === finding.ref);
      for (const op of ops) claimed.add(op);
      const evidence = input.existingRefs.has(finding.ref) ? [{ ref: finding.ref, quote: null }] : [];
      drafts.push({ group: finding.action, ref: finding.ref, text: finding.finding, evidence, ...stageAll(ops) });
    }
    for (const op of coverageOps.filter(candidate => !claimed.has(candidate))) {
      const ref = refOf(op);
      const exists = input.existingRefs.has(ref);
      const group: BibleAuditGroup = op.op.endsWith('.remove') ? 'remove' : exists ? 'revise' : 'add';
      drafts.push({ group, ref, text: rationaleOf(op) ?? `Proposed change to ${ref}`, evidence: exists ? [{ ref, quote: null }] : [], ...stageAll([op]) });
    }
  }

  const ordered = GROUP_ORDER.flatMap(group => drafts.filter(draft => draft.group === group));
  return { findings: ordered.map((finding, index) => ({ id: `f${index + 1}`, ...finding })), changeSet };
}

export function renderReportSummary(findings: readonly BibleAuditFinding[], checkedCopy: string): string {
  if (findings.length === 0) return `Nothing found. ${checkedCopy}`;
  const counts = GROUP_ORDER.flatMap(group => {
    const count = findings.filter(finding => finding.group === group).length;
    const [one, many] = GROUP_LABELS[group];
    return count > 0 ? [`${count} ${count === 1 ? one : many}`] : [];
  });
  return `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}: ${counts.join(', ')}. ${checkedCopy}`;
}
