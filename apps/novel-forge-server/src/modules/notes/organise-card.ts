import { ORGANISE_ACCEPTED_TOPIC, ORGANISE_RULES_TOPIC, ORGANISE_TOPIC, organiseTextKey } from '@shadow-library/sdk';

import { type Ledger, type Refinement } from '@server/database';

import { type NewLedgerEntry } from '../ledger/ledger.types';
import { type RecordFields } from '../refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '../refinement/change-set';
import { type CardReason, type ChangeSetSplit, type OpDisposition, splitChangeSet } from '../refinement/write-policy';
import { claimedDecision, claimsAfter, type OrganiseClaim, previousClaims } from './organise-claims';
import { pageLine } from './organise-content';
import { type OrganisePlan, type OrganiseSelection } from './organise-plan';
import { type OrganiseReconciliation, reconcileOrganiseEntries } from './organise-reconcile';
import { type OrganiseOptions } from './organise-round';
import { ORGANISE_STEP_KEY } from './organised-pages';

/**
 * `from_notes` rests on a quote found in the notes and passes the quote rule with the paragraphs it cites standing in for the author's words;
 * `suggested` is anything else the round would write; `planner_only` is the timeline or the open questions; `retired` takes out what an
 * earlier run wrote; `rule` is a hard rule the author keeps or declines.
 */
export type OrganiseEntryLabel = 'from_notes' | 'suggested' | 'planner_only' | 'retired' | 'rule';

export interface OrganiseCardEntry {
  opIndex: number;
  ref: string;
  label: OrganiseEntryLabel;
  paragraphs: number[];
  /** Why the quote rule kept a quoted entry out of `from_notes`. */
  reason?: CardReason;
  /** Notebook entries an earlier answer kept that declining this op takes out. */
  retires?: string[];
}

export interface OrganiseReceipt {
  /** The notes the paragraph numbers refer to: a screen compares it with the notes now to tell when they have been renumbered. */
  notesDigest: string;
  paragraphs: number;
  unusedParagraphs: number[];
  passes: number;
  /** Distinct pages and records by label, a page offered in two halves counted once. */
  fromNotes: number;
  suggested: number;
  rules: number;
  /** The ops applied at once, indexed into that proposal. */
  applied: OrganiseCardEntry[];
  /** The ops waiting on the card, indexed into it. */
  card: OrganiseCardEntry[];
}

export interface OrganiseOpRecord {
  label: OrganiseEntryLabel;
  ref: string;
  paragraphs: number[];
  reason?: CardReason;
  /** What organising holds at `ref` once this op is applied. */
  claim?: OrganiseClaim;
  /** Notebook entries this op carries: a kept rule, or a suggestion the page it writes adopts. */
  entries?: NewLedgerEntry[];
  /** False for an op that only touches a record the Story Bible already holds, so it counts as no entry. */
  counted: boolean;
  /** The active Notebook entries an earlier answer kept for the same rule or suggestion, which declining this op takes out. */
  retires?: string[];
}

export interface OrganiseMixedPage {
  page: string;
  notesOnly: number;
  whole: number;
}

/** What an organise proposal records on the ledger when applied, aligned to its change-set; `applied` is the ledger rows that apply wrote. */
export interface OrganiseRecord {
  version: 1;
  role: 'applied' | 'card';
  decision: { statement: string; payload: Record<string, unknown> };
  settled: OrganiseClaim[];
  ops: OrganiseOpRecord[];
  mixed: OrganiseMixedPage[];
  /** Earlier refusals of a suggestion this round offers again, taken back only when the author adopts it. */
  withdraws: string[];
  receipt: OrganiseReceipt;
  applied?: OrganiseLedgerDelta;
}

export interface OrganiseLedgerDelta {
  created: string[];
  /** Entries the apply retired, each with the successor it wrote, or none when it withdrew the entry. */
  retired: { id: string; successor: string | null }[];
}

interface Candidate extends Omit<OrganiseOpRecord, 'label' | 'reason'> {
  op: ChangeOp;
  label?: OrganiseEntryLabel;
  reason?: CardReason;
  /** The whole page beside its notes-only write: it carries what is not from the notes, so it is always a suggestion. */
  beside: boolean;
  notesOnly: boolean;
}

export interface OrganiseCandidates {
  split: ChangeSetSplit;
  records: ReadonlyMap<ChangeOp, Candidate>;
  template: OrganiseRecord['decision'];
  settled: OrganiseClaim[];
  plan: Pick<OrganisePlan, 'withdraws'>;
  options: Pick<OrganiseOptions, 'notesDigest' | 'paragraphs' | 'unusedParagraphs'>;
  passes: number;
}

export interface OrganiseCandidateInput {
  plan: OrganisePlan;
  options: OrganiseOptions;
  source: { paragraphs: readonly string[]; notes: string };
  current: ReadonlyMap<string, RecordFields>;
  mode: Refinement.ChatMode;
  passes: number;
  /** The active ledger the round was organised against. */
  ledger: Ledger.Entry[];
}

const RATIONALES: Record<OrganiseEntryLabel, (paragraphs: string) => string> = {
  from_notes: paragraphs => `From your notes${paragraphs}.`,
  suggested: () => 'Suggested — not in your notes.',
  planner_only: paragraphs => `Organised from your notes${paragraphs}; planner-only, so it waits for you.`,
  retired: () => 'No longer part of what your notes organise into.',
  rule: paragraphs => `A rule from your notes${paragraphs}; kept as a Notebook direction only if you keep it.`,
};

/** Everything the round offered, each suggestion accepted and each rule whose quote was found: the card is where the author keeps or declines them. */
export function organiseCardSelection(options: OrganiseOptions): OrganiseSelection {
  return {
    sections: options.pages.flatMap(page => page.sections.map(section => section.id)),
    records: options.records.map(record => record.id),
    timeline: options.timeline.map(event => ({ optionId: event.id, band: event.band })),
    rules: options.rules.filter(rule => rule.quote !== undefined).map(rule => rule.id),
    questions: options.questions.map(item => item.id),
    suggestions: options.suggestions.map(suggestion => ({ optionId: suggestion.id, verdict: 'accept' as const })),
  };
}

function refOf(op: ChangeOp): string {
  return changeSetRefs([op])[0] ?? '';
}

function pageOfEntry(entry: NewLedgerEntry): string | undefined {
  const page = entry.links?.bibleDocuments?.[0];
  return page ? `doc:${page.section}/${page.slug}` : undefined;
}

function candidates(plan: OrganisePlan, options: OrganiseOptions): Candidate[] {
  const sources = new Map(plan.sources.map(source => [source.ref, source]));
  const adopted = plan.entries.filter(entry => entry.topic === ORGANISE_ACCEPTED_TOPIC);
  const adoptedOn = (ref: string) => adopted.filter(entry => pageOfEntry(entry) === ref);
  const content = plan.changeSet.flatMap((op): Candidate[] => {
    const ref = refOf(op);
    const source = sources.get(ref);
    const entries = op.op === 'bible_document.upsert' ? adoptedOn(ref) : [];
    const counted = op.op !== 'entity.upsert' || op.name !== undefined;
    const whole: Candidate = {
      op: source?.quote ? { ...op, quote: source.quote } : op,
      ref,
      paragraphs: source?.paragraphs ?? [],
      claim: plan.claims.byOp.get(op),
      ...(entries.length > 0 ? { entries } : {}),
      counted,
      beside: false,
      notesOnly: false,
    };
    if (!source?.notesOnly || op.op !== 'bible_document.upsert') return [whole];
    const { notesOnly } = source;
    return [
      { op: { ...notesOnly.op, quote: notesOnly.quote }, ref, paragraphs: notesOnly.paragraphs, claim: notesOnly.claim, counted, beside: false, notesOnly: true },
      { ...whole, beside: true },
    ];
  });
  const rules = plan.entries
    .filter(entry => entry.topic === ORGANISE_RULES_TOPIC)
    .map((entry): Candidate => {
      const optionId = (entry.payload as { optionId: string }).optionId;
      const paragraphs = options.rules.find(rule => organiseTextKey(pageLine(rule.rule)) === organiseTextKey(entry.statement))?.paragraphs ?? [];
      return {
        op: { op: 'organise.rule', rule: entry.statement, optionId },
        ref: `rule:${optionId}`,
        paragraphs,
        entries: [entry],
        counted: true,
        beside: false,
        notesOnly: false,
        label: 'rule',
      };
    });
  return [...content, ...rules];
}

function labelOf(disposition: OpDisposition | undefined): OrganiseEntryLabel {
  if (!disposition) return 'suggested';
  if (disposition.side === 'direct') return 'from_notes';
  if (disposition.rule === 'removal') return 'retired';
  if (disposition.rule === 'planner_only_page') return 'planner_only';
  return 'suggested';
}

function withoutQuote(op: ChangeOp): ChangeOp {
  const { quote: _quote, ...rest } = op;
  return rest as ChangeOp;
}

const KEPT_BEFORE_NOTE = ' Already in your Notebook — declining it takes it out.';

function withRationale(op: ChangeOp, label: OrganiseEntryLabel, paragraphs: number[], retires: readonly string[]): ChangeOp {
  const cited = paragraphs.length > 0 ? ` (${paragraphs.map(number => `¶${number}`).join(', ')})` : '';
  const { rationale: _rationale, ...content } = label === 'from_notes' ? op : withoutQuote(op);
  return { ...content, rationale: `${RATIONALES[label](cited)}${retires.length > 0 ? KEPT_BEFORE_NOTE : ''}` } as ChangeOp;
}

function optionIdOf(entry: Pick<NewLedgerEntry, 'payload'>): string | undefined {
  const optionId = (entry.payload as { optionId?: unknown } | null | undefined)?.optionId;
  return typeof optionId === 'string' ? optionId : undefined;
}

/** The active entry an earlier organise answer kept for the same rule or suggestion. */
function keptBefore(ledger: readonly Ledger.Entry[], entry: NewLedgerEntry): Ledger.Entry | undefined {
  const optionId = optionIdOf(entry);
  if (optionId === undefined) return undefined;
  return ledger.find(earlier => earlier.supersededAt === null && earlier.stepKey === ORGANISE_STEP_KEY && earlier.topic === entry.topic && optionIdOf(earlier) === optionId);
}

/**
 * An entry's own words must come from the paragraphs it cites, not from anywhere in the notes: a quote from one paragraph must not carry
 * words the entry took from another. The quote rule runs on each entry alone against those paragraphs first; one that fails loses its quote.
 */
function judgedAlone(candidate: Candidate, input: OrganiseCandidateInput): Candidate {
  if (!candidate.op.quote) return candidate;
  const vocabulary = candidate.paragraphs.map(number => input.source.paragraphs[number - 1] ?? '').join('\n\n');
  const [disposition] = splitChangeSet({ ops: [candidate.op], authorMessage: vocabulary, vocabulary, mode: 'auto', held: false, state: { current: input.current } }).dispositions;
  return disposition?.side === 'direct' ? candidate : { ...candidate, op: withoutQuote(candidate.op), reason: disposition?.reason };
}

/**
 * The quote rule decides which of the round's writes are the author's own. What passes applies at once as its own proposal; everything
 * else — suggestions, the planner-only pages, what an earlier run wrote and this one retires, and the rules — waits on the card. A page
 * mixing both is offered as its notes-backed sections, then the whole page.
 */
export function organiseCandidates(input: OrganiseCandidateInput): OrganiseCandidates {
  const all = candidates(input.plan, input.options).map(candidate => (candidate.beside || candidate.label === 'rule' ? candidate : judgedAlone(candidate, input)));
  const judged = all.filter(candidate => !candidate.beside && candidate.label !== 'rule');
  const split = splitChangeSet({
    ops: judged.map(candidate => candidate.op),
    authorMessage: input.source.notes,
    vocabulary: input.source.notes,
    mode: input.mode,
    held: false,
    state: { current: input.current },
  });
  judged.forEach((candidate, index) => {
    const disposition = split.dispositions[index];
    candidate.label = labelOf(disposition);
    if (candidate.op.quote && candidate.label === 'suggested') candidate.reason ??= disposition?.reason;
  });
  const records = new Map<ChangeOp, Candidate>();
  const ops = all.map(candidate => {
    const label = candidate.label ?? 'suggested';
    const retires = (candidate.entries ?? []).flatMap(entry => {
      const earlier = keptBefore(input.ledger, entry);
      return earlier ? [String(earlier.id)] : [];
    });
    const op = withRationale(candidate.op, label, candidate.paragraphs, retires);
    records.set(op, { ...candidate, label, ...(retires.length > 0 ? { retires } : {}) });
    return op;
  });
  const direct = ops.filter(op => records.get(op)?.label === 'from_notes');
  const decision = input.plan.entries.find(entry => entry.kind === 'decision' && entry.topic === ORGANISE_TOPIC);
  const { pages: _pages, records: _records, ...payload } = (decision?.payload ?? {}) as Record<string, unknown>;
  return {
    split: { ops, direct, cards: ops.filter(op => !direct.includes(op)), dispositions: split.dispositions, held: false },
    records,
    template: { statement: decision?.statement ?? '', payload },
    settled: input.plan.claims.settled,
    plan: input.plan,
    options: input.options,
    passes: input.passes,
  };
}

function entriesOf(ops: readonly ChangeOp[], records: ReadonlyMap<ChangeOp, Candidate>): OrganiseCardEntry[] {
  return ops.map((op, opIndex) => {
    const record = records.get(op);
    return {
      opIndex,
      ref: record?.ref ?? refOf(op),
      label: record?.label ?? 'suggested',
      paragraphs: record?.paragraphs ?? [],
      ...(record?.reason ? { reason: record.reason } : {}),
      ...(record?.retires ? { retires: record.retires } : {}),
    };
  });
}

function distinctRefs(candidates: OrganiseCandidates, ops: readonly ChangeOp[], label: OrganiseEntryLabel): Set<string> {
  return new Set(
    ops.flatMap(op => {
      const record = candidates.records.get(op);
      return record && record.counted && record.label === label ? [record.ref] : [];
    }),
  );
}

/** A page offered in two halves counts once: as from the notes when its notes-backed half is, else as a suggestion. */
export function organiseReceipt(candidates: OrganiseCandidates, applied: readonly ChangeOp[], card: readonly ChangeOp[]): OrganiseReceipt {
  const every = [...applied, ...card];
  const fromNotes = distinctRefs(candidates, every, 'from_notes');
  const suggested = [...distinctRefs(candidates, every, 'suggested')].filter(ref => !fromNotes.has(ref));
  return {
    notesDigest: candidates.options.notesDigest,
    paragraphs: candidates.options.paragraphs,
    unusedParagraphs: candidates.options.unusedParagraphs,
    passes: candidates.passes,
    fromNotes: fromNotes.size,
    suggested: suggested.length,
    rules: distinctRefs(candidates, every, 'rule').size,
    applied: entriesOf(applied, candidates.records),
    card: entriesOf(card, candidates.records),
  };
}

function paragraphList(numbers: number[]): string {
  return numbers.map(number => `¶${number}`).join(', ');
}

export function organiseSummary(receipt: OrganiseReceipt): string {
  const unused = receipt.unusedParagraphs.length;
  const notUsed = unused === 0 ? '' : ` · not used yet: ${unused} ${unused === 1 ? 'paragraph' : 'paragraphs'} (${paragraphList(receipt.unusedParagraphs)})`;
  const rules = receipt.rules === 0 ? '' : `, ${receipt.rules} ${receipt.rules === 1 ? 'rule' : 'rules'}`;
  return `Your notes, organised: ${receipt.fromNotes} from your notes, ${receipt.suggested} suggested${rules}${notUsed}`;
}

/**
 * The record a proposal of the staged ops carries. What applies at once records only the decision, as the app's; the card is the author's
 * answer, so it also settles the rules and suggestions it offers again.
 */
export function organiseRecordFor(candidates: OrganiseCandidates, ops: readonly ChangeOp[], role: OrganiseRecord['role'], receipt: OrganiseReceipt): OrganiseRecord {
  const opRecords = ops.map((op): OrganiseOpRecord => {
    const { op: _op, beside: _beside, notesOnly: _notesOnly, label, ...record } = candidates.records.get(op) as Candidate;
    return { ...record, label: label ?? 'suggested' };
  });
  const mixed = ops.flatMap((op, whole): OrganiseMixedPage[] => {
    const record = candidates.records.get(op);
    if (!record?.beside) return [];
    const notesOnly = ops.findIndex(other => candidates.records.get(other)?.notesOnly && candidates.records.get(other)?.ref === record.ref);
    return notesOnly === -1 ? [] : [{ page: record.ref.slice('doc:'.length), notesOnly, whole }];
  });
  return {
    version: 1,
    role,
    decision: candidates.template,
    settled: candidates.settled,
    ops: opRecords,
    mixed,
    withdraws: role === 'card' ? candidates.plan.withdraws.map(String) : [],
    receipt,
  };
}

/**
 * The entries applying a record's selected ops writes: the decision claims what the applied writes left and, where the author declined a
 * write, keeps the earlier claim at its ref; a rule or an adopted suggestion becomes a direction only when its op was applied.
 */
export function appliedOrganiseEntries(record: OrganiseRecord, selected: readonly number[], ledger: Ledger.Entry[]): NewLedgerEntry[] {
  const chosen = [...new Set(selected)].sort((a, b) => a - b).flatMap(index => (record.ops[index] ? [record.ops[index]] : []));
  const claims = claimsAfter(
    previousClaims(ledger),
    record.settled,
    chosen.flatMap(op => (op.claim ? [op.claim] : [])),
  );
  const { pages, records, links } = claimedDecision(claims);
  const decision: NewLedgerEntry = {
    kind: 'decision',
    topic: ORGANISE_TOPIC,
    statement: record.decision.statement,
    payload: { ...record.decision.payload, pages, records },
    links,
    decidedBy: record.role === 'card' ? 'author' : 'system',
    stepKey: ORGANISE_STEP_KEY,
  };
  return [decision, ...chosen.flatMap(op => op.entries ?? [])];
}

/**
 * What applying a record's selected ops does to the ledger. The decision replaces the one before it. A rule or suggestion the card offers
 * again is kept when its op is applied and taken out when declined; one this round did not offer stays as it was. An earlier refusal of a
 * suggestion is lifted only when the author adopts it now.
 */
export function organiseReconciliation(record: OrganiseRecord, selected: readonly number[], ledger: Ledger.Entry[]): OrganiseReconciliation {
  const chosen = new Set(selected);
  const [decision, ...kept] = appliedOrganiseEntries(record, selected, ledger);
  const settled = reconcileOrganiseEntries({ entries: decision ? [decision] : [], replaces: [ORGANISE_TOPIC], retires: [], withdraws: [] }, ledger);
  const create = [...settled.create];
  const supersede = [...settled.supersede];
  const withdraw = [...settled.withdraw];
  record.ops.forEach((op, index) => {
    for (const entry of op.entries ?? []) {
      const earlier = keptBefore(ledger, entry);
      const next = { ...entry, stepKey: ORGANISE_STEP_KEY };
      if (!chosen.has(index)) {
        if (earlier) withdraw.push(earlier);
      } else if (!earlier) create.push(next);
      else if (earlier.statement.trim() !== entry.statement.trim()) supersede.push({ previous: earlier, next });
    }
  });
  const adopted = new Set(kept.filter(entry => entry.topic === ORGANISE_ACCEPTED_TOPIC).map(entry => organiseTextKey(entry.statement)));
  const lifted = new Set(record.withdraws);
  withdraw.push(...ledger.filter(entry => lifted.has(String(entry.id)) && entry.stepKey === ORGANISE_STEP_KEY && adopted.has(organiseTextKey(entry.statement))));
  return { create, supersede, withdraw };
}
