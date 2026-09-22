import { and, asc, eq, inArray } from 'drizzle-orm';
import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type BriefSceneInput, renderBriefBody, renderSceneEvents } from '@server/common';
import { type Ledger, type Plan, type PrimaryTransaction, schema } from '@server/database';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { sanitiseBriefReveals, type ScheduledReveal } from '../../ai/context/canon-guard';
import { blueprintBriefsPrompt } from '../../ai/prompts/blueprint-briefs.prompt';
import {
  type BlueprintBriefOut,
  type BlueprintBriefsOutput,
  BRIEF_BEATS_MAX,
  BRIEF_BEATS_MIN,
  BRIEF_CITES_MAX,
  BRIEF_LINE_MAX,
  BRIEF_NAME_MAX,
  BRIEF_SCENES_MAX,
  BRIEF_WHY_MAX,
  BRIEF_WRITER_LINE_MAX,
  BRIEFS_MAX,
} from '../../ai/schemas/blueprint-briefs.schema';
import { HOOK_TYPES, type HookTypeValue } from '../../ai/schemas/enums';
import { type BriefUpdateOp, type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type ScreenStep, type StepInputContext, type StepOption } from '../engine/blueprint-step.types';
import { ARCS_TOPIC, firstVolume } from './arcs.step';
import { lockedLinks, removedContentOps } from './content-keys';
import { lockedCast, renderLockedCast } from './locked-cast';
import { planningSections } from './planning-context';
import { ledgerReveals } from './spine.step';

export const BRIEFS_STEP_KEY = 'briefs';
export const BRIEFS_TOPIC = 'briefs';
export const BRIEFS_BUDGET_TOKENS = 40_000;

const CITE_PREFIXES = ['bible_doc', 'entity'] as const;

export interface PinnedReveal {
  factKey: string;
  scheduledChapter: number;
  when: string;
}

export interface ArcOneShape {
  arcKey: string;
  volumeKey: string;
  title: string;
  purpose: string;
  turn: string;
  chapterStart: number;
  chapterEnd: number;
}

@Schema()
export class BriefSceneOption {
  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  goal: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  obstacle: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  turn: string;

  @Field(() => [String], { minItems: BRIEF_BEATS_MIN, maxItems: BRIEF_BEATS_MAX })
  beats: string[];

  @Field(() => Integer, { minimum: 1 })
  estimatedWords: number;
}

@Schema()
export class BriefOption {
  @Field({ pattern: '^br[0-9]+$' })
  id: string;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;

  @Field({ minLength: 1, maxLength: BRIEF_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: BRIEF_NAME_MAX })
  pov: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  purpose: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  objective: string;

  @Field(() => [BriefSceneOption], { minItems: 1, maxItems: BRIEF_SCENES_MAX })
  scenes: BriefSceneOption[];

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  endsOn: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  mustNotResolve: string;

  @Field(() => [String], { maxItems: BRIEF_CITES_MAX })
  cites: string[];

  @Field(() => [String])
  readerValue: string[];

  @Field(() => [String], { description: 'Canon-fact keys this chapter reveals on the page; empty unless it lands a scheduled secret.' })
  learns: string[];

  @Field(() => String, { enum: [...HOOK_TYPES] })
  hookType: HookTypeValue;

  @Field({ maxLength: BRIEF_LINE_MAX })
  emotionalBeat: string;

  @Field({ maxLength: BRIEF_LINE_MAX })
  handoffState: string;

  @Field({ description: 'The chapter hands straight into the next one.' })
  continuesIntoNextChapter: boolean;

  @Field({ description: 'The chapter opens in the beat the previous one handed off.' })
  startsFromPreviousChapter: boolean;

  @Field({ maxLength: BRIEF_LINE_MAX })
  handoffBeat: string;
}

@Schema()
export class BriefsOptions {
  @Field({ maxLength: BRIEF_NAME_MAX })
  arcKey: string;

  @Field({ maxLength: BRIEF_NAME_MAX })
  arcTitle: string;

  @Field(() => Integer, { minimum: 0 })
  chapterStart: number;

  @Field(() => Integer, { minimum: 0 })
  chapterEnd: number;

  @Field(() => [BriefOption], { maxItems: BRIEFS_MAX })
  briefs: BriefOption[];
}

@Schema()
export class BriefsInput {
  @Field(() => Integer, { optional: true, minimum: 1, description: 'Rewrite this chapter’s brief alone and leave every other one exactly as it is.' })
  chapter?: number;
}

@Schema()
export class BriefChoice {
  @Field({ optional: true, pattern: '^br[0-9]+$' })
  optionId?: string;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;

  @Field({ minLength: 1, maxLength: BRIEF_NAME_MAX })
  title: string;

  @Field({ optional: true, maxLength: BRIEF_NAME_MAX, description: 'Entity key of the POV character.' })
  pov?: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX })
  purpose: string;
}

@Schema()
export class BriefsSelection {
  @Field(() => [BriefChoice], { minItems: 1, maxItems: BRIEFS_MAX, description: 'Arc one’s chapters in order; together they cover all of it.' })
  briefs: BriefChoice[];

  @Field({ optional: true, maxLength: BRIEF_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: BRIEF_WRITER_LINE_MAX, description: 'What arc one’s shape means for whoever writes chapter one.' })
  writerLine: string;
}

function decisionOn(ledger: Ledger.Entry[], topic: string): Ledger.Entry | undefined {
  return [...ledger].reverse().find(entry => entry.topic === topic && entry.kind === 'decision');
}

function payloadOf(entry: Ledger.Entry | undefined): Record<string, unknown> {
  return typeof entry?.payload === 'object' && entry?.payload !== null ? (entry.payload as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Arc one as the arcs lock left it: the only arc this phase briefs, and the chapter range it was tiled onto. */
export function arcOne(ledger: Ledger.Entry[]): ArcOneShape | null {
  const decision = decisionOn(ledger, ARCS_TOPIC);
  const payload = payloadOf(decision);
  const arcs = Array.isArray(payload['arcs']) ? payload['arcs'] : [];
  const first = arcs.find(item => typeof item === 'object' && item !== null && count((item as { ordinal?: unknown }).ordinal) === 1) ?? arcs[0];
  if (typeof first !== 'object' || first === null) return null;
  const arc = first as Record<string, unknown>;
  const arcKey = text(arc['arcKey']);
  return arcKey
    ? {
        arcKey,
        volumeKey: text(payload['volumeKey']),
        title: text(arc['title']),
        purpose: text(arc['purpose']),
        turn: text(arc['turn']),
        chapterStart: count(arc['chapterStart']),
        chapterEnd: count(arc['chapterEnd']),
      }
    : null;
}

/**
 * The spine's schedule, minus the one reveal pinned inside volume one: that one is this phase's to place, and guarding arc one against
 * it would strip the very contract the author is here to write.
 */
export function laterReveals(ledger: Ledger.Entry[]): ScheduledReveal[] {
  const pinned = pinnedReveal(ledger);
  return ledgerReveals(ledger)
    .filter(reveal => reveal.factKey !== pinned?.factKey)
    .map(reveal => ({ factKey: reveal.factKey, revealChapter: reveal.revealChapter, terms: reveal.terms, writerNote: reveal.writerNote || null }));
}

/** The reveal the spine pinned inside volume one, which exactly one chapter of arc one may land. */
export function pinnedReveal(ledger: Ledger.Entry[]): PinnedReveal | null {
  const found = ledgerReveals(ledger).find(reveal => reveal.pinned && reveal.movement === 1);
  return found ? { factKey: found.factKey, scheduledChapter: found.revealChapter, when: found.when } : null;
}

/** The shape the reveal guard scans: every field it knows how to rewrite, under the names it knows them by. */
function scannable(brief: BlueprintBriefOut, chapter: number) {
  return {
    chapter,
    title: brief.title.trim(),
    objective: brief.objective.trim(),
    scenes: brief.scenes.map(scene => ({
      goal: scene.goal.trim(),
      obstacle: scene.obstacle.trim(),
      turn: scene.turn.trim(),
      beats: scene.beats.map(beat => beat.trim()).filter(Boolean),
      estimatedWords: scene.estimatedWords,
    })),
    chapterPurpose: brief.purpose.trim(),
    handoffBeat: brief.handoffBeat?.trim() ?? '',
    endingContract: {
      hookType: brief.endingContract.hookType,
      emotionalBeat: brief.endingContract.emotionalBeat.trim(),
      openQuestion: brief.endsOn.trim(),
      handoffState: brief.endingContract.handoffState.trim(),
      mustNotResolve: [brief.mustNotResolve.trim()],
    },
    knowledgeContract: brief.knowledgeContract,
    pov: brief.pov.trim(),
    cites: brief.cites.map(ref => ref.trim()).filter(ref => CITE_PREFIXES.some(prefix => ref.startsWith(`${prefix}:`))),
    readerValue: brief.readerValue.map(value => value.trim()).filter(Boolean),
    continuesIntoNextChapter: brief.continuesIntoNextChapter === true,
    startsFromPreviousChapter: brief.startsFromPreviousChapter === true,
  };
}

function briefOption(brief: ReturnType<typeof scannable>, index: number): BriefOption {
  return {
    id: `br${index + 1}`,
    chapter: brief.chapter,
    title: brief.title,
    pov: brief.pov,
    purpose: brief.chapterPurpose,
    objective: brief.objective,
    scenes: brief.scenes,
    endsOn: brief.endingContract.openQuestion,
    mustNotResolve: brief.endingContract.mustNotResolve[0] ?? '',
    cites: brief.cites,
    readerValue: brief.readerValue,
    learns: (brief.knowledgeContract?.learns ?? []).map(reveal => reveal.factKey.trim()).filter(Boolean),
    hookType: brief.endingContract.hookType,
    emotionalBeat: brief.endingContract.emotionalBeat,
    handoffState: brief.endingContract.handoffState,
    continuesIntoNextChapter: brief.continuesIntoNextChapter,
    startsFromPreviousChapter: brief.startsFromPreviousChapter,
    handoffBeat: brief.handoffBeat,
  };
}

/**
 * The merge a single-brief revision depends on, in code rather than as a promise the model keeps: a round that names a chapter takes
 * that chapter from the round and every other chapter, byte for byte, from what the author is already looking at.
 */
export function mergeBriefs(previous: BriefOption[], fresh: BriefOption[], chapter: number | null): BriefOption[] {
  if (chapter === null) return fresh;
  const revised = fresh.find(brief => brief.chapter === chapter) ?? fresh[0];
  const merged = previous.map(brief => (brief.chapter === chapter && revised ? { ...revised, id: brief.id, chapter } : brief));
  return merged.length > 0 ? merged : fresh;
}

function briefsOfRound(output: BlueprintBriefsOutput, arc: ArcOneShape | null, guard: ScheduledReveal[]): BriefOption[] {
  const start = arc && arc.chapterStart > 0 ? arc.chapterStart : 1;
  const ordered = [...output.briefs].sort((left, right) => left.chapter - right.chapter).map((brief, index) => scannable(brief, start + index));
  return sanitiseBriefReveals(ordered, guard).briefs.map(briefOption);
}

function renderScope(arc: ArcOneShape | null, ledger: Ledger.Entry[], guard: ScheduledReveal[]): string {
  const pinned = pinnedReveal(ledger);
  const span = arc ? `chapters ${arc.chapterStart} to ${arc.chapterEnd}` : 'its own chapter range';
  const schedule =
    guard.length > 0 ? guard.map(reveal => `- ${reveal.factKey} comes out at chapter ${reveal.revealChapter}; never name: ${reveal.terms.join(', ') || '(no terms)'}`) : [];
  return [
    arc
      ? `Brief arc one, "${arc.title}", which runs ${span}. What it is for: ${arc.purpose} The turn it ends on: ${arc.turn}`
      : 'Volume one has no locked arcs yet; brief the opening chapters from the notebook and keep the arc short.',
    `Write exactly one brief per chapter of ${span}, in order.`,
    `The cast that exists, named by entity key — POV must be one of these:\n${renderLockedCast(lockedCast(ledger))}`,
    pinned
      ? `The spine pins one reveal inside volume one, at "${pinned.when}" (fact key \`${pinned.factKey}\`). Exactly one chapter of this arc lands it: give that chapter a knowledgeContract naming \`${pinned.factKey}\` in "learns". If arc one is too early for it, land it in no chapter at all.`
      : 'No reveal is pinned inside volume one; no chapter of this arc carries a knowledge contract.',
    schedule.length > 0 ? `Secrets scheduled after this arc, which nothing here may surface:\n${schedule.join('\n')}` : 'Nothing later in the novel is withheld from this arc.',
  ].join('\n');
}

function renderSoFar(previous: BriefsOptions): string | null {
  if (previous.briefs.length === 0) return null;
  const lines = previous.briefs.map(brief => `- ch ${brief.chapter} "${brief.title}" (POV ${brief.pov}): ${brief.purpose}`).join('\n');
  return `The briefs on the author's screen:\n${lines}\n\nA round asked for one chapter keeps the rest exactly as they are; a round asked for the whole arc replaces them, so do not simply hand these back.`;
}

function assertSelection(selection: BriefsSelection): void {
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the shape of arc one means for whoever writes chapter one' });
  if (selection.briefs.some(brief => !brief.title.trim() || !brief.purpose.trim())) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every chapter needs a title and what it is for' });
  }
}

async function arcOneRow(tx: PrimaryTransaction, projectId: bigint, volume: Plan.Volume): Promise<Plan.Arc> {
  const arcs = await tx.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, volume.volumeKey)), orderBy: asc(schema.arcs.ordinal) });
  const arc = arcs[0];
  if (!arc) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'volume one has no arcs yet — break it into arcs before briefing the first one' });
  if (arc.status !== 'approved')
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'arc one is not approved yet — lock volume one’s arcs again so the approval runs' });
  if (arc.staleReason) {
    throw AppErrorCode.BPR_004.create({
      part: 'selection',
      issues: `volume one changed since these arcs were drawn (${arc.staleReason}) — lock the arcs again before briefing them`,
    });
  }
  if (arc.chapterStart === null || arc.chapterEnd === null)
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'arc one has no chapter range — lock volume one’s arcs again' });
  return arc;
}

/** Only the refs that resolve today reach a brief: an unresolvable ref costs the drafter a section and tells it nothing. */
async function resolvableCites(tx: PrimaryTransaction, projectId: bigint, cites: string[]): Promise<string[]> {
  const wanted = [...new Set(cites)];
  if (wanted.length === 0) return [];
  const docKeys = wanted.filter(ref => ref.startsWith('bible_doc:')).map(ref => ref.slice('bible_doc:'.length));
  const entityKeys = wanted.filter(ref => ref.startsWith('entity:')).map(ref => ref.slice('entity:'.length));
  const [documents, entities] = await Promise.all([
    docKeys.length > 0 ? tx.query.bibleDocuments.findMany({ columns: { section: true, slug: true }, where: eq(schema.bibleDocuments.projectId, projectId) }) : [],
    entityKeys.length > 0
      ? tx.query.entities.findMany({ columns: { entityKey: true }, where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, entityKeys)) })
      : [],
  ]);
  const known = new Set([...documents.map(doc => `bible_doc:${doc.section}/${doc.slug}`), ...entities.map(entity => `entity:${entity.entityKey}`)]);
  return wanted.filter(ref => known.has(ref));
}

interface PlannedBrief {
  chapter: number;
  choice: BriefChoice;
  option: BriefOption | undefined;
}

/** Where this step's last lock said the pinned reveal comes out, which is what a lock with nothing to say about it must not undo. */
function datedReveal(ledger: Ledger.Entry[]): { factKey: string; chapter: number } | null {
  const reveal = payloadOf(decisionOn(ledger, BRIEFS_TOPIC))['reveal'];
  const record = typeof reveal === 'object' && reveal !== null ? (reveal as Record<string, unknown>) : {};
  const factKey = text(record['factKey']);
  return factKey ? { factKey, chapter: count(record['chapter']) } : null;
}

/**
 * A shortened arc drops the briefs past its end, and `brief.remove` would take one out from under prose already drafted against it,
 * leaving a draft with no plan and nothing to reconcile it to. The author shortens the arc or throws the draft away first.
 */
async function assertNoDraftedBriefsDropped(tx: PrimaryTransaction, projectId: bigint, previous: Ledger.Links, planned: PlannedBrief[]): Promise<void> {
  const kept = new Set(planned.map(item => item.chapter));
  const dropped = (previous.briefChapters ?? []).filter(chapter => !kept.has(chapter));
  if (dropped.length === 0) return;
  const drafts = await tx.query.drafts.findMany({ columns: { chapter: true }, where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, dropped)) });
  if (drafts.length === 0) return;
  throw AppErrorCode.BPR_004.create({
    part: 'selection',
    issues: `chapter ${drafts.map(draft => draft.chapter).join(', ')} already has prose drafted from its brief — delete the draft before shortening arc one`,
  });
}

function briefOp(planned: PlannedBrief, arc: Plan.Arc, cites: string[], contract: BriefUpdateOp['knowledgeContract']): BriefUpdateOp {
  const { chapter, choice, option } = planned;
  const base: BriefUpdateOp = {
    op: 'brief.update',
    chapter,
    volumeKey: arc.volumeKey,
    arcKey: arc.arcKey,
    title: choice.title.trim(),
    chapterPurpose: choice.purpose.trim(),
    ...(choice.pov?.trim() ? { pov: choice.pov.trim() } : {}),
  };
  if (!option) return base;
  const scenes: BriefSceneInput[] = option.scenes.map(scene => ({ ...scene }));
  return {
    ...base,
    body: renderBriefBody({
      objective: option.objective,
      events: renderSceneEvents(scenes),
      continuesIntoNextChapter: option.continuesIntoNextChapter,
      startsFromPreviousChapter: option.startsFromPreviousChapter,
      ...(option.handoffBeat ? { handoffBeat: option.handoffBeat } : {}),
    }),
    contextRefs: cites,
    readerValue: option.readerValue,
    endingContract: {
      hookType: option.hookType,
      emotionalBeat: option.emotionalBeat || option.endsOn,
      openQuestion: option.endsOn,
      handoffState: option.handoffState || option.endsOn,
      mustNotResolve: [option.mustNotResolve],
    },
    knowledgeContract: contract ?? null,
  };
}

export const briefsStep: ScreenStep<BlueprintBriefsOutput, BriefsOptions, BriefsInput, BriefsSelection> = {
  kind: 'screen',
  key: BRIEFS_STEP_KEY,
  phase: 'opening',
  required: true,
  completionTopics: [BRIEFS_TOPIC],
  nudges: ['Open mid-action', 'Slower opening', 'Stronger hook', 'Fewer POV changes'],
  prompt: blueprintBriefsPrompt,
  optionsSchema: BriefsOptions,
  inputSchema: BriefsInput,
  selectionSchema: BriefsSelection,
  budgetTokens: BRIEFS_BUDGET_TOKENS,

  async inputs(context: StepInputContext<BriefsOptions, BriefsInput>) {
    const arc = arcOne(context.ledger);
    const sections: BlueprintInputSection[] = [{ key: 'briefs_scope', content: renderScope(arc, context.ledger, laterReveals(context.ledger)), required: true }];
    sections.push(...(await planningSections(context)));
    const soFar = context.previous ? renderSoFar(context.previous) : null;
    if (soFar) sections.push({ key: 'briefs_so_far', content: soFar });
    return sections;
  },

  renderInput(input) {
    return input.chapter === undefined ? null : `Rewrite chapter ${input.chapter}'s brief alone; leave every other chapter out of the JSON entirely.`;
  },

  toRound(output, { previous, input, ledger }) {
    const arc = arcOne(ledger);
    const fresh = briefsOfRound(output, arc, laterReveals(ledger));
    const briefs = mergeBriefs(previous?.briefs ?? [], fresh, input?.chapter ?? null);
    if (briefs.length === 0) throw AppErrorCode.AI_001.create();
    return {
      options: {
        arcKey: arc?.arcKey ?? '',
        arcTitle: arc?.title ?? output.arcTitle.trim(),
        chapterStart: briefs[0]?.chapter ?? 1,
        chapterEnd: briefs.at(-1)?.chapter ?? 1,
        briefs,
      },
      coachMessage: output.coachMessage.trim(),
    };
  },

  describeOptions(options) {
    return options.briefs.map((brief): StepOption => ({ id: brief.id, label: `Chapter ${brief.chapter} — ${brief.title}` }));
  },

  chosenOptionIds(selection) {
    return selection.briefs.flatMap(brief => (brief.optionId ? [brief.optionId] : []));
  },

  /**
   * Arc one's chapter briefs, as ordinary brief rows the Workspace writes from. The briefs are renumbered onto the arc row's own
   * range rather than the numbers the round showed, because approving the volume plan is what finally decides where arc one sits.
   */
  async materialise(selection, { round, ledger, project, tx }) {
    assertSelection(selection);
    const volume = await firstVolume(tx, project.id);
    const arc = await arcOneRow(tx, project.id, volume);
    const start = arc.chapterStart as number;
    const span = (arc.chapterEnd as number) - start + 1;
    if (selection.briefs.length !== span) {
      throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `arc one runs ${span} chapters, and these briefs cover ${selection.briefs.length}` });
    }

    const offered = new Map((round?.options.briefs ?? []).map(brief => [brief.id, brief]));
    const planned: PlannedBrief[] = selection.briefs.map((choice, index) => ({
      chapter: start + index,
      choice,
      option: choice.optionId ? offered.get(choice.optionId) : undefined,
    }));

    const pinned = pinnedReveal(ledger);
    const lands = pinned ? planned.find(item => item.option?.learns.includes(pinned.factKey)) : undefined;
    const dated = datedReveal(ledger);
    // A lock whose chapters all come from the round says where the reveal is; one answered from the notebook alone carries no
    // evidence about it, so the dating the last lock made stands rather than being read as the author having dropped it.
    const evidence = planned.some(item => item.option !== undefined);
    const carried = !evidence && dated !== null && pinned !== null && dated.factKey === pinned.factKey ? dated.chapter : null;
    const landsAt = lands?.chapter ?? carried;
    const cites = await Promise.all(planned.map(item => resolvableCites(tx, project.id, item.option?.cites ?? [])));
    await assertNoDraftedBriefsDropped(tx, project.id, lockedLinks(ledger, BRIEFS_STEP_KEY), planned);

    const changeSet: ContentOp[] = planned.map((item, index) => {
      const pov = (item.choice.pov ?? item.option?.pov ?? '').trim();
      const contract = pinned && item === lands && pov ? { pov: [pov], learns: [{ entityKey: pov, factKey: pinned.factKey }] } : null;
      return briefOp(item, arc, cites[index] ?? [], contract);
    });

    // The spine schedules a pinned reveal at its movement's last chapter because that is the only altitude it had; the brief that
    // actually lands it is what finally dates it, and the fact has to move with it or the chapter is written blind to its own secret.
    if (pinned && landsAt !== null) changeSet.push({ op: 'fact.upsert', factKey: pinned.factKey, revealChapter: landsAt });
    if (pinned && landsAt === null && dated?.factKey === pinned.factKey) {
      changeSet.push({ op: 'fact.upsert', factKey: pinned.factKey, revealChapter: pinned.scheduledChapter });
    }

    const links: Ledger.Links = { arcKeys: [arc.arcKey], briefChapters: planned.map(item => item.chapter) };
    changeSet.push(...removedContentOps(lockedLinks(ledger, BRIEFS_STEP_KEY), links, new Set([arc.arcKey])));

    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: BRIEFS_TOPIC,
          statement: `${arc.title ?? arc.arcKey}: ${planned.length} chapter briefs (ch ${start}–${arc.chapterEnd})`,
          why: selection.why?.trim() || null,
          writerLine: selection.writerLine.trim(),
          payload: {
            arcKey: arc.arcKey,
            volumeKey: arc.volumeKey,
            chapterStart: start,
            chapterEnd: arc.chapterEnd,
            briefs: planned.map(item => ({
              chapter: item.chapter,
              title: item.choice.title.trim(),
              pov: (item.choice.pov ?? item.option?.pov ?? '').trim(),
              purpose: item.choice.purpose.trim(),
            })),
            ...(pinned && landsAt !== null ? { reveal: { factKey: pinned.factKey, chapter: landsAt, scheduledChapter: pinned.scheduledChapter } } : {}),
          },
          links,
        },
      ],
      changeSet,
      summary: 'Blueprint: arc one’s chapter briefs',
    };
    return plan;
  },
};
