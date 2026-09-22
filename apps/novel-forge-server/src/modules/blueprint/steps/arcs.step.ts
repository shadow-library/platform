import { asc, eq } from 'drizzle-orm';
import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger, type Plan, type PrimaryTransaction, schema } from '@server/database';

import { ARC_CHAPTERS_MAX, ARC_CHAPTERS_MIN, ARCS_MAX, VOLUME_ONE_LINE_MAX, VOLUME_ONE_NAME_MAX, VOLUME_ONE_WRITER_LINE_MAX } from '../../ai/schemas/blueprint-volume-one.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { lockedLinks, removedContentOps } from './content-keys';
import { type ArcsSliceOptions, VOLUME_ONE_PASS_STEP_KEY, type VolumeOneOptions } from './volume-one-pass.step';

export const ARCS_STEP_KEY = 'arcs';
export const ARCS_TOPIC = 'arcs';
export const ARCS_WHY_MAX = 400;
export const VOLUME_PLAN_PAGE: PageRef = { section: 'story_state', slug: 'volume-plan' };

const ARCS_HEADING = 'Volume one · arcs';

export function arcKeyOf(volumeKey: string, ordinal: number): string {
  return `${volumeKey}_arc_${ordinal}`;
}

export interface ChapterRange {
  chapterStart: number;
  chapterEnd: number;
}

/**
 * The arcs of a volume have to cover its chapters exactly — approval refuses anything else — so the author's lengths are treated as
 * proportions of the range the volume plan laid out rather than as the range itself, and the last arc absorbs what rounding leaves.
 */
export function tileChapters(requested: number[], start: number, end: number): ChapterRange[] {
  const span = end - start + 1;
  if (requested.length === 0 || span < requested.length) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `${span} chapters cannot hold ${requested.length} arcs` });
  const total = requested.reduce((sum, chapters) => sum + Math.max(1, chapters), 0);
  const lengths: number[] = [];
  let used = 0;
  for (const [index, chapters] of requested.entries()) {
    const remaining = requested.length - index - 1;
    const ideal = Math.round((Math.max(1, chapters) * span) / total);
    const length = Math.max(1, Math.min(ideal, span - used - remaining));
    lengths.push(length);
    used += length;
  }
  lengths[lengths.length - 1] = (lengths.at(-1) as number) + (span - used);

  let next = start;
  return lengths.map(length => {
    const range = { chapterStart: next, chapterEnd: next + length - 1 };
    next = range.chapterEnd + 1;
    return range;
  });
}

@Schema()
export class ArcChoice {
  @Field({ optional: true, pattern: '^ac[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'What this arc is for — what the novel cannot do without it.' })
  purpose: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'What is true after this arc that was not true before it.' })
  turn: string;

  @Field(() => Integer, {
    minimum: ARC_CHAPTERS_MIN,
    maximum: ARC_CHAPTERS_MAX,
    description: 'How long it should run; the volume’s own range is what the arcs are finally tiled across.',
  })
  chapters: number;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX, description: 'The relationship rung this arc lands, named as the cast ladder names it.' })
  rung?: string;
}

@Schema()
export class ArcsSelection {
  @Field(() => [ArcChoice], { minItems: 1, maxItems: ARCS_MAX, description: 'Volume one in order; together they cover all of it.' })
  arcs: ArcChoice[];

  @Field({ optional: true, maxLength: ARCS_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_WRITER_LINE_MAX, description: 'What the shape of volume one means for whoever writes chapter one.' })
  writerLine: string;
}

interface KeyedArc extends ChapterRange {
  arc: ArcChoice;
  arcKey: string;
  ordinal: number;
}

/** Volume one as the Blueprint owns it: the first volume it planned, never an imported `source` volume that sits before it. */
export async function firstVolume(tx: PrimaryTransaction, projectId: bigint): Promise<Plan.Volume> {
  const volumes = await tx.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) });
  const volume = volumes.find(candidate => candidate.status !== 'source') ?? volumes[0];
  if (!volume) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'there are no volumes yet — lock the spine before breaking volume one into arcs' });
  return volume;
}

/** The range the approved volume plan gave volume one, or — before it is approved — the length the spine asked for. */
function volumeSpan(volume: Plan.Volume, arcs: number): ChapterRange {
  const start = Math.max(volume.startChapter ?? 1, 1);
  const end = volume.endChapter ?? start + Math.max(volume.targetChapterCount ?? arcs, arcs) - 1;
  if (end < start) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'volume one ends before it begins; re-lock the spine before breaking it into arcs' });
  if (end - start + 1 < arcs) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `volume one is only ${end - start + 1} chapters long, so it cannot hold ${arcs} arcs` });
  }
  return { chapterStart: start, chapterEnd: end };
}

function arcBody(arc: ArcChoice): string {
  const lines = [arc.purpose.trim(), `**The turn:** ${arc.turn.trim()}`];
  if (arc.rung?.trim()) lines.push(`**Relationship rung:** ${arc.rung.trim()}`);
  return lines.join('\n\n');
}

function arcOp({ arc, arcKey, ordinal, chapterStart, chapterEnd }: KeyedArc, volumeKey: string): ContentOp {
  return {
    op: 'arc.upsert',
    arcKey,
    volumeKey,
    ordinal,
    title: arc.title.trim(),
    objective: arc.purpose.trim(),
    payoff: arc.turn.trim(),
    chapterStart,
    chapterEnd,
    body: arcBody(arc),
  };
}

function arcsSection(keyed: KeyedArc[]): string {
  return keyed
    .map(({ arc, ordinal, chapterStart, chapterEnd }) => {
      const rung = arc.rung?.trim() ? ` · rung: ${arc.rung.trim()}` : '';
      return `${ordinal}. **${arc.title.trim()}** (ch ${chapterStart}–${chapterEnd}) — ${arc.purpose.trim()} *Turn: ${arc.turn.trim()}*${rung}`;
    })
    .join('\n');
}

function assertSelection(selection: ArcsSelection): void {
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the shape of volume one means for whoever writes chapter one' });
  if (selection.arcs.some(arc => !arc.title.trim() || !arc.purpose.trim() || !arc.turn.trim())) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every arc needs a name, what it is for, and the turn it ends on' });
  }
}

export const arcsStep: SourcedScreenStep<VolumeOneOptions, ArcsSliceOptions | null, ArcsSelection> = {
  kind: 'screen',
  key: ARCS_STEP_KEY,
  phase: 'volume_one',
  required: true,
  completionTopics: [ARCS_TOPIC],
  nudges: ['Tighter', 'Merge two arcs', 'Bring the opposition forward', 'A quieter arc three'],
  selectionSchema: ArcsSelection,
  source: { step: VOLUME_ONE_PASS_STEP_KEY, select: options => options.arcs ?? null },

  describeView(view) {
    return (view?.arcs ?? []).map(arc => ({ id: arc.id, label: `${arc.title} — ${arc.purpose}` }));
  },

  chosenOptionIds(selection) {
    return selection.arcs.flatMap(arc => (arc.optionId ? [arc.optionId] : []));
  },

  /**
   * The arcs of volume one, tiled across the chapter range the approved volume plan gave it. Only arc one gets chapter briefs, and the
   * Opening phase writes those; approving the arcs is what unlocks it, and it runs after the commit because it is an action.
   */
  async materialise(selection, { ledger, project, tx }) {
    assertSelection(selection);
    const volume = await firstVolume(tx, project.id);
    const span = volumeSpan(volume, selection.arcs.length);
    const ranges = tileChapters(
      selection.arcs.map(arc => arc.chapters),
      span.chapterStart,
      span.chapterEnd,
    );
    const keyed: KeyedArc[] = selection.arcs.map((arc, index) => ({
      arc,
      ordinal: index + 1,
      arcKey: arcKeyOf(volume.volumeKey, index + 1),
      ...(ranges[index] as ChapterRange),
    }));
    const page = await loadPageBody(tx, project.id, VOLUME_PLAN_PAGE);

    // The volume is named in the payload, never in the links: links say what this lock MADE, and a link to a volume it only planned
    // inside would let a later lock of this step remove it.
    const links: Ledger.Links = { bibleDocuments: [VOLUME_PLAN_PAGE], arcKeys: keyed.map(item => item.arcKey) };
    const changeSet: ContentOp[] = [
      ...keyed.map(item => arcOp(item, volume.volumeKey)),
      { op: 'bible_document.upsert', ...VOLUME_PLAN_PAGE, body: upsertPageSections(page, 'The volume plan', null, [{ heading: ARCS_HEADING, body: arcsSection(keyed) }]) },
      // The volume is named in `keep` as well as left out of the links: an entry written before that rule existed must not turn a
      // re-lock into a volume deletion.
      ...removedContentOps(lockedLinks(ledger, ARCS_STEP_KEY), links, new Set([volume.volumeKey])),
    ];

    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: ARCS_TOPIC,
          statement: keyed.map(({ arc }) => arc.title.trim()).join(' → '),
          why: selection.why?.trim() || null,
          writerLine: selection.writerLine.trim(),
          payload: {
            volumeKey: volume.volumeKey,
            arcs: keyed.map(({ arc, arcKey, ordinal, chapterStart, chapterEnd }) => ({
              arcKey,
              ordinal,
              title: arc.title.trim(),
              purpose: arc.purpose.trim(),
              turn: arc.turn.trim(),
              chapterStart,
              chapterEnd,
              rung: arc.rung?.trim() ?? '',
            })),
          },
          links,
        },
      ],
      changeSet,
      summary: 'Blueprint: volume one in arcs',
      afterCommit: context => context.runActions([{ op: 'action.approve_arcs', volumeKey: volume.volumeKey }]),
    };
    return plan;
  },
};
