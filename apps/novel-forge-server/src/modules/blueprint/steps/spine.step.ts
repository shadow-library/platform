import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import {
  MOVEMENT_CHAPTERS_MAX,
  MOVEMENT_CHAPTERS_MIN,
  MOVEMENTS_MAX,
  REVEAL_TERMS_MAX,
  REVEALS_MAX,
  SPINE_LINE_MAX,
  SPINE_NAME_MAX,
  SPINE_TEXT_MAX,
  SPINE_WRITER_LINE_MAX,
} from '../../ai/schemas/blueprint-spine.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type PlannedLedgerEntry, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { mergeLedgerLinks } from '../ledger/ledger-entries';
import { promiseTailoringApplies } from '../stage/promise-tailoring';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { lockedLinks, removedContentOps } from './content-keys';
import { OPEN_FROM_CHAPTER } from './world.step';
import { endingQuestion, SPINE_PASS_STEP_KEY, type SpineMode, spineMode, type SpineOptions, type SpineSliceOptions } from './spine-pass.step';

export const SPINE_STEP_KEY = 'spine';
export const SPINE_TOPIC = 'spine';
export const SPINE_REVEALS_TOPIC = 'spine.reveals';
export const SPINE_PAGE: PageRef = { section: 'plot', slug: 'escalation-map' };

const MOVEMENT_HEADINGS: Record<SpineMode, string> = { movements: 'Movements', seasons: 'Seasons' };
const REVEAL_HEADINGS: Record<SpineMode, string> = { movements: 'Reveal schedule', seasons: 'Milestones' };

/** Ordinal-keyed and never named after the secret: the key itself rides the planner's reveal schedule, where the truth must not. */
export function revealFactKey(ordinal: number): string {
  return `reveal_${ordinal}`;
}

/** Ordinal-keyed, so re-locking a renamed movement updates the volume it renamed rather than leaving an orphan beside a new one. */
export function volumeKeyOf(ordinal: number): string {
  return `volume_${ordinal}`;
}

@Schema()
export class SpineMovementChoice {
  @Field({ optional: true, pattern: '^mv[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: SPINE_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX })
  summary: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'What changes in the protagonist across this movement.' })
  change: string;

  @Field(() => Integer, { minimum: MOVEMENT_CHAPTERS_MIN, maximum: MOVEMENT_CHAPTERS_MAX })
  chapters: number;
}

@Schema()
export class SpineRevealChoice {
  @Field({ optional: true, pattern: '^rv[0-9]+$' })
  optionId?: string;

  @Field(() => Integer, { minimum: 1, maximum: MOVEMENTS_MAX, description: 'The movement it comes out in; the canon fact is scheduled to that movement’s last chapter.' })
  movement: number;

  @Field({ minLength: 1, maxLength: SPINE_NAME_MAX })
  when: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'The secret. It becomes a scheduled canon fact and is never written onto a Story Bible page.' })
  truth: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'The only part of the reveal an earlier chapter’s writer is shown; it must never state the truth.' })
  writerNote: string;

  @Field(() => [String], { optional: true, maxItems: REVEAL_TERMS_MAX, description: 'Give-away names and phrases no chapter before the reveal may use.' })
  terms?: string[];
}

@Schema()
export class SpineSelection {
  @Field(() => [SpineMovementChoice], { minItems: 1, maxItems: MOVEMENTS_MAX, description: 'One movement per volume, in order.' })
  movements: SpineMovementChoice[];

  @Field(() => [SpineRevealChoice], { optional: true, maxItems: REVEALS_MAX, description: 'Earliest first; the first one is pinned and the rest stay sketches.' })
  reveals?: SpineRevealChoice[];

  @Field({ optional: true, maxLength: SPINE_LINE_MAX })
  note?: string;

  @Field({ optional: true, maxLength: SPINE_TEXT_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: SPINE_WRITER_LINE_MAX, description: 'What the shape of the novel means for whoever writes chapter one.' })
  writerLine: string;

  @Field({
    optional: true,
    maxLength: SPINE_WRITER_LINE_MAX,
    description: 'What the schedule means for whoever writes chapter one. It rides every chapter pack, so it says how to hold the secret, never what it is.',
  })
  revealsWriterLine?: string;
}

interface KeyedMovement {
  movement: SpineMovementChoice;
  ordinal: number;
  volumeKey: string;
}

function keyMovements(movements: SpineMovementChoice[]): KeyedMovement[] {
  return movements.map((movement, index) => ({ movement, ordinal: index + 1, volumeKey: volumeKeyOf(index + 1) }));
}

interface KeyedReveal {
  reveal: SpineRevealChoice;
  factKey: string;
  revealChapter: number;
  pinned: boolean;
}

/**
 * A reveal placed in a movement is scheduled to that movement's last chapter: at sketch altitude the volume is all the author has
 * said, and the conservative reading is the safe one — nothing earlier may surface it, and the Opening phase's briefs reveal it on the
 * page where they actually do, through their own knowledge contract.
 */
export function revealChapterOf(keyed: KeyedMovement[], movement: number): number {
  const at = Math.min(Math.max(movement, 1), Math.max(keyed.length, 1));
  return keyed.slice(0, at).reduce((chapters, item) => chapters + Math.max(item.movement.chapters, 1), 0) || OPEN_FROM_CHAPTER;
}

function keyReveals(reveals: SpineRevealChoice[], keyed: KeyedMovement[]): KeyedReveal[] {
  return reveals.map((reveal, index) => ({
    reveal,
    factKey: revealFactKey(index + 1),
    revealChapter: revealChapterOf(keyed, reveal.movement),
    pinned: index === 0,
  }));
}

/** A real spoiler, so it is scheduled and carries the two things that let the drafter work around it without being told it. */
function revealFactOp({ reveal, factKey, revealChapter }: KeyedReveal): ContentOp {
  const terms = (reveal.terms ?? []).map(term => term.trim()).filter(Boolean);
  return {
    op: 'fact.upsert',
    factKey,
    body: reveal.truth.trim(),
    revealChapter,
    writerNote: reveal.writerNote.trim(),
    ...(terms.length > 0 ? { terms } : {}),
    constraintNote: `Comes out ${reveal.when.trim()}.`,
  };
}

function volumeBody(keyed: KeyedMovement): string {
  const { movement } = keyed;
  return [`**${movement.title.trim()}**`, movement.summary.trim(), `**The protagonist here:** ${movement.change.trim()}`].join('\n\n');
}

function volumeOp({ movement, ordinal, volumeKey }: KeyedMovement): ContentOp {
  return {
    op: 'volume.upsert',
    volumeKey,
    ordinal,
    title: movement.title.trim(),
    objective: movement.summary.trim(),
    payoff: movement.change.trim(),
    targetChapterCount: movement.chapters,
    body: volumeBody({ movement, ordinal, volumeKey }),
  };
}

function movementsSection(keyed: KeyedMovement[]): string {
  return keyed
    .map(({ movement, ordinal }) => `${ordinal}. **${movement.title.trim()}** (${movement.chapters} ch) — ${movement.summary.trim()} · *${movement.change.trim()}*`)
    .join('\n');
}

/**
 * The schedule without the secrets. A page is what the chapter writer is told, so it carries where each truth comes out and the key of
 * the canon fact holding it — never the truth, which the author reads in the Notebook and the drafter is only ever shown a note about.
 */
function revealsSection(reveals: KeyedReveal[], keyed: KeyedMovement[]): string {
  return reveals
    .map(({ reveal, factKey, revealChapter, pinned }) => {
      const movement = keyed[reveal.movement - 1]?.movement.title.trim() ?? 'the novel';
      return `- **${reveal.when.trim()}** — in ${movement}, not before chapter ${revealChapter} \`${factKey}\`${pinned ? ' *(pinned)*' : ' *(sketch)*'}`;
    })
    .join('\n');
}

function spineBody(current: string | null, mode: SpineMode, selection: SpineSelection, keyed: KeyedMovement[], reveals: KeyedReveal[], question: string): string {
  const lead = [question ? `**Ending question:** ${question}` : null, selection.note?.trim() || null].filter(Boolean).join('\n\n');
  return upsertPageSections(current, 'How the novel escalates', lead || null, [
    { heading: MOVEMENT_HEADINGS[mode], body: movementsSection(keyed) },
    { heading: REVEAL_HEADINGS[mode], body: revealsSection(reveals, keyed) },
  ]);
}

function statement(keyed: KeyedMovement[]): string {
  return keyed.map(({ movement }) => movement.title.trim()).join(' → ');
}

function assertSelection(selection: SpineSelection, reveals: SpineRevealChoice[], revealsRequired: boolean): void {
  if (selection.movements.some(movement => !movement.title.trim() || !movement.change.trim())) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every movement needs a name and what changes in the protagonist there' });
  }
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the shape of the novel means for whoever writes chapter one' });
  if (revealsRequired && reveals.length === 0) {
    throw AppErrorCode.BPR_004.create({
      part: 'selection',
      issues: 'mystery drives this novel, so the reveal schedule is part of the answer — say where at least one big truth comes out',
    });
  }
  const untold = reveals.find(reveal => !reveal.writerNote.trim());
  if (untold) {
    throw AppErrorCode.BPR_004.create({
      part: 'selection',
      issues: `say what whoever writes the chapters before "${untold.when.trim()}" must do about it without stating it — a reveal with no note is withheld from them entirely`,
    });
  }
  const told = reveals.find(reveal => reveal.writerNote.trim().toLowerCase().includes(reveal.truth.trim().toLowerCase()));
  if (told) {
    throw AppErrorCode.BPR_004.create({
      part: 'selection',
      issues: `the note for "${told.when.trim()}" states the truth it is meant to withhold; it is the one part of it the writer is shown`,
    });
  }
}

export const spineStep: SourcedScreenStep<SpineOptions, SpineSliceOptions | null, SpineSelection> = {
  kind: 'screen',
  key: SPINE_STEP_KEY,
  phase: 'spine',
  required: true,
  completionTopics: [SPINE_TOPIC],
  nudges: ['Fewer volumes', 'Faster start', 'Move a reveal earlier', 'A gentler middle'],
  selectionSchema: SpineSelection,
  source: { step: SPINE_PASS_STEP_KEY, select: options => options.spine ?? null },

  describeView(view) {
    return [
      ...(view?.movements ?? []).map(movement => ({ id: movement.id, label: `${movement.title} — ${movement.summary}` })),
      ...(view?.reveals ?? []).map(reveal => ({ id: reveal.id, label: `${reveal.when}: ${reveal.truth}` })),
    ];
  },

  chosenOptionIds(selection) {
    return [
      ...selection.movements.flatMap(movement => (movement.optionId ? [movement.optionId] : [])),
      ...(selection.reveals ?? []).flatMap(reveal => (reveal.optionId ? [reveal.optionId] : [])),
    ];
  },

  /**
   * One decision for the shape and, where the novel schedules them, one for the reveals. The movements also become the volume rows the
   * Workspace plans in, at sketch level: only volume one is detailed, and its chapter ranges come from the approval that follows the commit.
   */
  async materialise(selection, { round, ledger, project, tx }) {
    const reveals = (selection.reveals ?? []).filter(reveal => reveal.when.trim() && reveal.truth.trim());
    const revealsRequired = promiseTailoringApplies('reveal_schedule', ledger);
    assertSelection(selection, reveals, revealsRequired);

    const mode = spineMode(ledger);
    const question = endingQuestion(ledger);
    const keyed = keyMovements(selection.movements);
    const keyedReveals = keyReveals(reveals, keyed);
    const page = await loadPageBody(tx, project.id, SPINE_PAGE);

    const links: Ledger.Links = { bibleDocuments: [SPINE_PAGE], volumeKeys: keyed.map(item => item.volumeKey) };
    const revealLinks: Ledger.Links = { bibleDocuments: [SPINE_PAGE], factKeys: keyedReveals.map(item => item.factKey) };
    const changeSet: ContentOp[] = [
      ...keyed.map(volumeOp),
      ...keyedReveals.map(revealFactOp),
      { op: 'bible_document.upsert', ...SPINE_PAGE, body: spineBody(page, mode, selection, keyed, keyedReveals, question) },
      ...removedContentOps(lockedLinks(ledger, SPINE_STEP_KEY), mergeLedgerLinks(links, revealLinks)),
    ];

    const offered = round?.options ?? null;
    const shape: PlannedLedgerEntry = {
      kind: 'decision',
      topic: SPINE_TOPIC,
      statement: statement(keyed),
      why: selection.why?.trim() || null,
      writerLine: selection.writerLine.trim(),
      payload: {
        mode,
        endingQuestion: question,
        note: selection.note?.trim() ?? '',
        movements: keyed.map(({ movement, ordinal, volumeKey }) => ({
          volumeKey,
          ordinal,
          title: movement.title.trim(),
          summary: movement.summary.trim(),
          change: movement.change.trim(),
          chapters: movement.chapters,
        })),
      },
      links,
    };

    const entries: PlannedLedgerEntry[] = [shape];
    if (reveals.length > 0) {
      entries.push({
        kind: 'decision',
        topic: SPINE_REVEALS_TOPIC,
        statement: `${reveals[0]?.when.trim()}: ${reveals[0]?.truth.trim()}`,
        writerLine: selection.revealsWriterLine?.trim() || null,
        rejectedAlternatives: (offered?.reveals ?? [])
          .map(option => `${option.when}: ${option.truth}`)
          .filter(label => !reveals.some(kept => `${kept.when.trim()}: ${kept.truth.trim()}` === label)),
        payload: {
          reveals: keyedReveals.map(({ reveal, factKey, revealChapter, pinned }) => ({
            factKey,
            revealChapter,
            movement: reveal.movement,
            when: reveal.when.trim(),
            truth: reveal.truth.trim(),
            writerNote: reveal.writerNote.trim(),
            terms: (reveal.terms ?? []).map(term => term.trim()).filter(Boolean),
            pinned,
          })),
        },
        links: revealLinks,
      });
    }

    const plan: LockPlan = {
      entries,
      changeSet,
      summary: 'Blueprint: the spine of the novel',
      replaces: [SPINE_TOPIC, SPINE_REVEALS_TOPIC],
      // Approving the plan lays out every volume's chapter range, which is what the arcs of volume one are then tiled across.
      afterCommit: context => context.runActions([{ op: 'action.approve_volume_plan' }]),
    };
    return plan;
  },
};
