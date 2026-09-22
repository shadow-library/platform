import { and, asc, eq, inArray } from 'drizzle-orm';
import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { isOpenCanon } from '@server/common';
import { type Bible, type DbExecutor, type Ledger, schema } from '@server/database';

import { renderBibleDigest } from '../../ai/context/bible-docs';
import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintCheckPrompt } from '../../ai/prompts/blueprint-check.prompt';
import {
  type BlueprintCheckOutput,
  CHECK_CHOICES_MAX,
  CHECK_FINDING_KINDS,
  CHECK_FINDINGS_MAX,
  CHECK_LINE_MAX,
  CHECK_REASON_MAX,
  CHECK_TITLE_MAX,
  type CheckFindingKind,
} from '../../ai/schemas/blueprint-check.schema';
import { CHECK_FIX_OPS } from '../../ai/prompts/blueprint-check.prompt';
import { type ContentOp, validateChangeSet } from '../../refinement/change-set';
import { type LockPlan, type PlannedLedgerEntry, type ScreenStep, type StepInputContext, type StepOption } from '../engine/blueprint-step.types';
import { promiseTailoringApplies } from '../stage/promise-tailoring';
import { contentKey } from './content-keys';
import { hasAntagonist } from './opposition.step';
import { type LedgerReveal, ledgerReveals } from './spine.step';

export const CHECK_STEP_KEY = 'check';
export const CHECK_TOPIC = 'check';
export const CHECK_BUDGET_TOKENS = 16_000;

/** One pack per slice: the whole package does not fit a planning pack, and a check that quietly dropped half of it would pass on nothing. */
export const CHECK_SLICES = ['rules', 'cast', 'shape'] as const;

export type CheckSlice = (typeof CHECK_SLICES)[number];

export const CHECK_SLICE_LABELS: Record<CheckSlice, string> = {
  rules: 'Rules and briefs',
  cast: 'Cast, places and ages',
  shape: 'Premise, spine and arcs',
};

const SLICE_PAGES: Record<CheckSlice, readonly Bible.Section[]> = { rules: ['world', 'power'], cast: ['project', 'world'], shape: ['project', 'plot', 'story_state'] };
const SLICE_PAGES_BUDGET = 5_000;
const SLICE_PAGE_TOKENS = 1_800;
const BRIEF_BODY_MAX = 900;
const RECORDS_MAX = 40;

function isCheckSlice(value: unknown): value is CheckSlice {
  return typeof value === 'string' && (CHECK_SLICES as readonly string[]).includes(value);
}

@Schema()
export class CheckSliceState {
  @Field(() => String, { enum: [...CHECK_SLICES] })
  slice: CheckSlice;

  @Field({ description: 'Whether this slice has been checked yet; the step is not finished until every slice has.' })
  run: boolean;

  @Field(() => Integer, { minimum: 0 })
  passed: number;
}

@Schema()
export class CheckChoiceOption {
  @Field({ pattern: '^f[0-9]+[ab]$' })
  id: string;

  @Field({ minLength: 1, maxLength: CHECK_TITLE_MAX })
  label: string;

  @Field({ minLength: 1, maxLength: CHECK_LINE_MAX })
  detail: string;

  @Field(() => [Object], { description: 'The ops this fix applies; empty when taking it is a decision rather than an edit.' })
  changeSet: Record<string, unknown>[];
}

@Schema()
export class CheckFindingOption {
  @Field({ pattern: '^f[0-9]+$' })
  id: string;

  @Field(() => String, { enum: [...CHECK_SLICES] })
  slice: CheckSlice;

  @Field(() => String, { enum: [...CHECK_FINDING_KINDS] })
  kind: CheckFindingKind;

  @Field({ minLength: 1, maxLength: CHECK_TITLE_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: CHECK_LINE_MAX })
  detail: string;

  @Field(() => [CheckChoiceOption], { maxItems: CHECK_CHOICES_MAX })
  choices: CheckChoiceOption[];
}

@Schema()
export class CheckOptions {
  @Field(() => [CheckSliceState])
  slices: CheckSliceState[];

  @Field(() => [CheckFindingOption], { maxItems: CHECK_FINDINGS_MAX * CHECK_SLICES.length })
  findings: CheckFindingOption[];
}

@Schema()
export class CheckInput {
  @Field(() => String, { optional: true, enum: [...CHECK_SLICES], description: 'The slice to check this round; the first unchecked one by default.' })
  slice?: CheckSlice;
}

@Schema()
export class CheckResolution {
  @Field({ pattern: '^f[0-9]+$' })
  findingId: string;

  @Field({ optional: true, pattern: '^f[0-9]+[ab]$', description: 'The way out the author took; omitted when they wrote their own fix or dismissed the finding.' })
  choiceId?: string;

  @Field({
    optional: true,
    maxLength: CHECK_REASON_MAX,
    description: 'The author’s own fix, or — for a dismissal — why the finding is not a problem. A dismissal without one is refused.',
  })
  text?: string;

  @Field({ description: 'The finding is not a problem; the reason is recorded in its place.' })
  dismissed: boolean;
}

@Schema()
export class CheckSelection {
  @Field(() => [CheckResolution], { maxItems: CHECK_FINDINGS_MAX * CHECK_SLICES.length })
  resolutions: CheckResolution[];
}

/** A finding's topic is made from what it is about, so answering the same finding in a later round supersedes the earlier answer. */
export function findingTopic(title: string): string {
  return `${CHECK_TOPIC}.${contentKey('', title, new Set())}`;
}

export function sliceOf(input: CheckInput | null, previous: CheckOptions | null): CheckSlice {
  if (input?.slice && isCheckSlice(input.slice)) return input.slice;
  const run = new Set((previous?.slices ?? []).filter(state => state.run).map(state => state.slice));
  return CHECK_SLICES.find(slice => !run.has(slice)) ?? (CHECK_SLICES[0] as CheckSlice);
}

/** The slices nothing has checked yet, counted against the slices the step has rather than the ones a round happens to list. */
export function unrunSlices(slices: readonly CheckSliceState[]): CheckSlice[] {
  return CHECK_SLICES.filter(slice => !slices.some(state => state.slice === slice && state.run));
}

function sliceStates(previous: CheckOptions | null, slice: CheckSlice, passed: number): CheckSliceState[] {
  return CHECK_SLICES.map(candidate => {
    if (candidate === slice) return { slice: candidate, run: true, passed };
    const before = previous?.slices.find(state => state.slice === candidate);
    return { slice: candidate, run: before?.run ?? false, passed: before?.passed ?? 0 };
  });
}

interface UnnumberedFinding {
  slice: CheckSlice;
  kind: CheckFindingKind;
  title: string;
  detail: string;
  choices: { label: string; detail: string; changeSet: Record<string, unknown>[] }[];
}

function renumber(findings: UnnumberedFinding[]): CheckFindingOption[] {
  return findings.map((finding, index) => ({
    ...finding,
    id: `f${index + 1}`,
    choices: finding.choices.slice(0, CHECK_CHOICES_MAX).map((choice, at) => ({ ...choice, id: `f${index + 1}${at === 0 ? 'a' : 'b'}` })),
  }));
}

/**
 * The slice just checked replaces its own findings and leaves every other slice's exactly as they were, so running the next slice
 * never costs the author an answer they were about to give on the last one. Ids are handed out again afterwards, because they name
 * a place in the round rather than a finding, and the ledger addresses a finding by its own topic.
 */
export function mergeFindings(previous: CheckOptions | null, slice: CheckSlice, fresh: BlueprintCheckOutput['findings']): CheckFindingOption[] {
  const kept: UnnumberedFinding[] = (previous?.findings ?? [])
    .filter(finding => finding.slice !== slice)
    .map(finding => ({
      slice: finding.slice,
      kind: finding.kind,
      title: finding.title,
      detail: finding.detail,
      choices: finding.choices.map(choice => ({ label: choice.label, detail: choice.detail, changeSet: choice.changeSet })),
    }));
  const added: UnnumberedFinding[] = fresh.map(finding => ({
    slice,
    kind: finding.kind,
    title: finding.title.trim(),
    detail: finding.detail.trim(),
    choices: finding.choices.map(choice => ({ label: choice.label.trim(), detail: choice.detail.trim(), changeSet: choice.changeSet })),
  }));
  return renumber([...kept, ...added]);
}

async function slicePages(db: Pick<DbExecutor, 'query'>, projectId: bigint, slice: CheckSlice): Promise<BlueprintInputSection | null> {
  const documents = await db.query.bibleDocuments.findMany({
    columns: { section: true, slug: true, frontmatter: true, body: true },
    where: and(eq(schema.bibleDocuments.projectId, projectId), inArray(schema.bibleDocuments.section, [...SLICE_PAGES[slice]])),
  });
  const digest = renderBibleDigest(documents, { totalTokens: SLICE_PAGES_BUDGET, perDocTokens: SLICE_PAGE_TOKENS, coreOnly: false });
  return digest.text ? { key: 'check_pages', content: digest.text } : null;
}

async function sliceRecords(db: Pick<DbExecutor, 'query'>, projectId: bigint, slice: CheckSlice): Promise<BlueprintInputSection | null> {
  if (slice === 'rules') {
    const facts = await db.query.canonFacts.findMany({
      columns: { factKey: true, text: true, revealChapter: true, constraintNote: true, writerNote: true },
      where: eq(schema.canonFacts.projectId, projectId),
    });
    // A scheduled secret reaches this pack as its key, its chapter and its writer note, never its text: the findings this pack
    // produces are titled and labelled by the model, and those titles ride writer packs as decisions.
    const lines = facts.slice(0, RECORDS_MAX).map(fact => {
      if (!isOpenCanon(fact.revealChapter)) return `- \`${fact.factKey}\` is withheld until chapter ${fact.revealChapter ?? '?'}${fact.writerNote ? `: ${fact.writerNote}` : ''}`;
      return `- \`${fact.factKey}\` (open canon): ${fact.text}${fact.constraintNote ? ` — why: ${fact.constraintNote}` : ''}`;
    });
    return lines.length > 0 ? { key: 'check_facts', content: `Canon facts the chapters are held to:\n${lines.join('\n')}` } : null;
  }
  if (slice === 'cast') {
    const entities = await db.query.entities.findMany({
      columns: { entityKey: true, type: true, name: true, body: true, notes: true },
      where: eq(schema.entities.projectId, projectId),
    });
    const lines = entities
      .slice(0, RECORDS_MAX)
      .map(entity => `- \`${entity.entityKey}\` (${entity.type}) ${entity.name}: ${(entity.body ?? entity.notes ?? '').replace(/\s+/g, ' ').slice(0, CHECK_LINE_MAX)}`);
    return lines.length > 0 ? { key: 'check_records', content: `Characters, places and factions as the Story Bible holds them:\n${lines.join('\n')}` } : null;
  }
  const [volumes, arcs] = await Promise.all([
    db.query.volumes.findMany({
      columns: { volumeKey: true, title: true, objective: true, startChapter: true, endChapter: true },
      where: eq(schema.volumes.projectId, projectId),
      orderBy: asc(schema.volumes.ordinal),
    }),
    db.query.arcs.findMany({
      columns: { arcKey: true, title: true, objective: true, payoff: true, chapterStart: true, chapterEnd: true },
      where: eq(schema.arcs.projectId, projectId),
      orderBy: asc(schema.arcs.ordinal),
    }),
  ]);
  const lines = [
    ...volumes.map(volume => `- volume \`${volume.volumeKey}\` ${volume.title ?? ''} (ch ${volume.startChapter ?? '?'}–${volume.endChapter ?? '?'}): ${volume.objective ?? ''}`),
    ...arcs.map(arc => `- arc \`${arc.arcKey}\` ${arc.title ?? ''} (ch ${arc.chapterStart ?? '?'}–${arc.chapterEnd ?? '?'}): ${arc.objective ?? ''} Turn: ${arc.payoff ?? ''}`),
  ];
  return lines.length > 0 ? { key: 'check_plan', content: `The plan as it stands:\n${lines.join('\n')}` } : null;
}

async function sliceBriefs(db: Pick<DbExecutor, 'query'>, projectId: bigint): Promise<BlueprintInputSection | null> {
  const briefs = await db.query.briefs.findMany({
    columns: { chapter: true, title: true, body: true, pov: true },
    where: eq(schema.briefs.projectId, projectId),
    orderBy: asc(schema.briefs.chapter),
  });
  if (briefs.length === 0) return null;
  const lines = briefs.map(
    brief => `### Chapter ${brief.chapter}${brief.title ? ` — ${brief.title}` : ''}${brief.pov ? ` (POV ${brief.pov})` : ''}\n${brief.body.slice(0, BRIEF_BODY_MAX)}`,
  );
  return { key: 'check_briefs', content: `The chapter briefs the first arc will be written from:\n\n${lines.join('\n\n')}` };
}

/** The schedule without its secrets: the key, where it comes out and the phrases that give it away — the same shape the outliner is given. */
function renderRevealGuard(reveals: LedgerReveal[]): string | null {
  if (reveals.length === 0) return null;
  const lines = reveals.map(reveal => `- \`${reveal.factKey}\` comes out at chapter ${reveal.revealChapter}; never name: ${reveal.terms.join(', ') || '(no terms)'}`);
  return `Secrets the design withholds. A finding may say that a chapter surfaces one too early; nothing you write may state one:\n${lines.join('\n')}`;
}

function renderScope(slice: CheckSlice, ledger: Ledger.Entry[]): string {
  const gentle = promiseTailoringApplies('seasons', ledger);
  const looks: Record<CheckSlice, string> = {
    rules:
      'Check the world rules, the cost of power and the ladder against the chapter briefs: a brief that has someone pay a price the rules do not allow, a rule no chapter ever pays, a fact scheduled after a chapter that needs it.',
    cast: 'Check the cast, the places and the factions against each other and against the briefs: ages and spans that do not add up, a character who wants nothing of their own, someone the briefs need who has no card, a place a chapter happens in that nobody wrote down.',
    shape: gentle
      ? 'Check the premise, the theme, the ending question, the spine and the arcs against each other. This is a slice of life: look for rhythm and small change — seasons that pass without anything being different, a life that does not accumulate, a milestone with nothing behind it. Do not ask for an antagonist or for escalation; this novel was never promised either.'
      : 'Check the premise, the theme, the ending question, the spine and the arcs against each other: an arc that ends where it began, an escalation that does not escalate, a promise the ending question does not answer, opposition that stops acting.',
  };
  return [
    `Check the "${CHECK_SLICE_LABELS[slice]}" slice this round, and report on nothing else.`,
    looks[slice],
    hasAntagonist(ledger) ? '' : 'This novel has no antagonist by decision, and its absence is never a finding.',
    renderRevealGuard(ledgerReveals(ledger)) ?? 'Nothing in this novel is withheld from the reader on a schedule.',
    'Count in "passed" the checks you ran on this slice and found nothing wrong with, so the author can see what was looked at.',
  ]
    .filter(Boolean)
    .join('\n');
}

interface ResolvedFinding {
  finding: CheckFindingOption;
  resolution: CheckResolution;
  choice: CheckChoiceOption | undefined;
}

function assertResolution({ finding, resolution, choice }: ResolvedFinding): void {
  const reason = resolution.text?.trim();
  if (resolution.dismissed && !reason) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `say why "${finding.title}" is not a problem — a dismissal is a decision and carries its reason` });
  }
  if (!resolution.dismissed && !choice && !reason) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `"${finding.title}" needs one of its two ways out, a fix in your own words, or a dismissal with a reason` });
  }
  if (choice && choice.changeSet.length > 0) {
    const issues = validateChangeSet(choice.changeSet, [...CHECK_FIX_OPS]);
    if (issues.length > 0) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `the fix for "${finding.title}" cannot be applied: ${issues.join('; ')}` });
  }
}

/**
 * A resolution's wording ends up on a decision, and a decision's writer line rides every chapter pack, so the same rule the spine
 * holds its reveal notes to holds here: nothing the author resolves may state a truth the design is still withholding.
 */
function assertKeepsSecrets(resolved: ResolvedFinding[], reveals: LedgerReveal[]): void {
  const spoken = (value: string, truth: string): boolean => truth.length > 0 && value.toLowerCase().includes(truth.toLowerCase());
  for (const { finding, resolution, choice } of resolved) {
    const said = [finding.title, choice?.label ?? '', choice?.detail ?? '', resolution.text?.trim() ?? ''];
    const told = reveals.find(reveal => said.some(value => spoken(value, reveal.truth)));
    if (told) {
      throw AppErrorCode.BPR_004.create({
        part: 'selection',
        issues: `"${finding.title}" states the truth \`${told.factKey}\` withholds until chapter ${told.revealChapter}; a resolution rides every chapter pack, so name the problem without telling it`,
      });
    }
  }
}

/**
 * An arithmetic correction changes a record, and the record is what the writer reads; only a story fix changes what they must
 * actually do. Writer lines share one capped section with the whole notebook, so a pass of two dozen resolutions must not crowd out
 * arc one's shape and the voice notes decided in the same phase.
 */
function writerLineFor({ finding, resolution }: ResolvedFinding, statement: string): string | null {
  if (resolution.dismissed || finding.kind !== 'story') return null;
  return statement || null;
}

function resolutionEntry(item: ResolvedFinding): PlannedLedgerEntry {
  const { finding, resolution, choice } = item;
  const reason = resolution.text?.trim() ?? '';
  const others = finding.choices.filter(candidate => candidate.id !== choice?.id).map(candidate => candidate.label);
  if (resolution.dismissed) {
    return {
      kind: 'decision',
      topic: findingTopic(finding.title),
      statement: `Left as it is: ${finding.title}`,
      why: reason,
      payload: { slice: finding.slice, kind: finding.kind, finding: finding.title, resolution: 'dismissed' },
    };
  }
  const statement = choice ? choice.label : reason;
  const writerLine = writerLineFor(item, statement);
  return {
    kind: 'decision',
    topic: findingTopic(finding.title),
    statement,
    why: choice?.detail ?? null,
    ...(writerLine ? { writerLine } : {}),
    rejectedAlternatives: others,
    payload: { slice: finding.slice, kind: finding.kind, finding: finding.title, resolution: choice ? 'chosen' : 'own' },
  };
}

export const checkStep: ScreenStep<BlueprintCheckOutput, CheckOptions, CheckInput, CheckSelection> = {
  kind: 'screen',
  key: CHECK_STEP_KEY,
  phase: 'opening',
  required: true,
  completionTopics: [CHECK_TOPIC],
  nudges: ['Be stricter', 'Only what blocks chapter one', 'Check the numbers again'],
  prompt: blueprintCheckPrompt,
  optionsSchema: CheckOptions,
  inputSchema: CheckInput,
  selectionSchema: CheckSelection,
  budgetTokens: CHECK_BUDGET_TOKENS,

  async inputs(context: StepInputContext<CheckOptions, CheckInput>) {
    const slice = sliceOf(context.input, context.previous);
    const sections: BlueprintInputSection[] = [{ key: 'check_scope', content: renderScope(slice, context.ledger), required: true }];
    const [pages, records, briefs] = await Promise.all([
      slicePages(context.db, context.projectId, slice),
      sliceRecords(context.db, context.projectId, slice),
      slice === 'rules' ? sliceBriefs(context.db, context.projectId) : null,
    ]);
    for (const section of [pages, records, briefs]) if (section) sections.push(section);
    return sections;
  },

  renderInput(input) {
    return input.slice === undefined ? null : `Check the "${CHECK_SLICE_LABELS[input.slice]}" slice this round.`;
  },

  toRound(output, { previous, input }) {
    const slice = sliceOf(input, previous);
    return {
      options: { slices: sliceStates(previous, slice, output.passed), findings: mergeFindings(previous, slice, output.findings) },
      coachMessage: output.coachMessage.trim(),
    };
  },

  describeOptions(options) {
    return options.findings.flatMap((finding): StepOption[] => [
      { id: finding.id, label: finding.title },
      ...finding.choices.map(choice => ({ id: choice.id, label: `${finding.title}: ${choice.label}` })),
    ]);
  },

  chosenOptionIds(selection) {
    return selection.resolutions.flatMap(resolution => [resolution.findingId, ...(resolution.choiceId ? [resolution.choiceId] : [])]);
  },

  /**
   * Every resolution is a decision, including a dismissal — the author's reason for leaving something alone is the part a later
   * revisit needs. Only a fix the author actually took brings content with it.
   */
  async materialise(selection, { round, ledger }) {
    const findings = round?.options.findings ?? [];
    const byId = new Map(findings.map(finding => [finding.id, finding]));
    const resolved: ResolvedFinding[] = selection.resolutions.map(resolution => {
      const finding = byId.get(resolution.findingId);
      if (!finding) throw AppErrorCode.BPR_005.create({ optionId: resolution.findingId });
      const choice = resolution.dismissed ? undefined : finding.choices.find(candidate => candidate.id === resolution.choiceId);
      if (!resolution.dismissed && resolution.choiceId && !choice) throw AppErrorCode.BPR_005.create({ optionId: resolution.choiceId });
      return { finding, resolution, choice };
    });
    for (const item of resolved) assertResolution(item);
    assertKeepsSecrets(resolved, ledgerReveals(ledger));

    const answeredNow = new Set(resolved.map(item => findingTopic(item.finding.title)));
    const answeredBefore = new Set(ledger.filter(entry => entry.kind === 'decision' && entry.topic.startsWith(`${CHECK_TOPIC}.`)).map(entry => entry.topic));
    const open = findings.filter(finding => !answeredNow.has(findingTopic(finding.title)) && !answeredBefore.has(findingTopic(finding.title)));
    const slices = round?.options.slices ?? [];
    const passed = slices.reduce((total, state) => total + state.passed, 0);
    // Counted against the slices that exist, not the ones the round happens to name: a lock with no ready round has checked nothing,
    // and reading its empty list as "nothing outstanding" would let the required final check be skipped with a clean bill of health.
    const unchecked = unrunSlices(slices);
    if (unchecked.length > 0) {
      throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `${unchecked.map(slice => CHECK_SLICE_LABELS[slice]).join(' and ')} have not been checked yet` });
    }

    const dismissed = resolved.filter(item => item.resolution.dismissed).length;
    const plan: LockPlan = {
      entries: [
        ...resolved.map(resolutionEntry),
        {
          kind: 'decision',
          topic: CHECK_TOPIC,
          statement: `${passed} checks passed · ${resolved.length - dismissed} fixed · ${dismissed} left as they are · ${open.length} open`,
          payload: {
            passed,
            resolved: resolved.length,
            dismissed,
            open: open.length,
            slices: slices.map(state => ({ slice: state.slice, passed: state.passed })),
            openFindings: open.map(finding => finding.title),
          },
        },
      ],
      changeSet: resolved.flatMap(item => (item.choice?.changeSet ?? []) as unknown as ContentOp[]),
      summary: 'Blueprint: the final check',
    };
    return plan;
  },
};
