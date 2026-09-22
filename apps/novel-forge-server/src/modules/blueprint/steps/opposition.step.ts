import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { isOppositionKind, OPPOSITION_KIND_LABELS, OPPOSITION_KINDS, type OppositionKind } from '@shadow-library/sdk';

import { OPPOSITION_ENTITY_KINDS } from '@server/common';
import { type Ledger } from '@server/database';

import { ENGINE_LINE_MAX, ENGINE_NAME_MAX, ENGINE_TEXT_MAX, ENGINE_WRITER_LINE_MAX, OPPOSITION_FACES_MAX, OPPOSITION_GOALS_MAX } from '../../ai/schemas/blueprint-engine.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { isDecided, type StageLedgerEntry } from '../stage/blueprint-stage';
import { promiseTailoringApplies } from '../stage/promise-tailoring';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { contentKey, lockedLinks, removedContentOps, shortName } from './content-keys';
import { ENGINE_STEP_KEY, type EngineOptions, type OppositionSliceOptions } from './engine.step';

export const OPPOSITION_STEP_KEY = 'opposition';
export const OPPOSITION_TOPIC = 'opposition';
export const OPPOSITION_WHY_MAX = 400;
export const OPPOSITION_PAGE: PageRef = { section: 'project', slug: 'opposition' };

@Schema()
export class OppositionFaceChoice {
  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  arc: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  face: string;
}

@Schema()
export class OppositionSelection {
  @Field(() => String, { enum: [...OPPOSITION_KINDS], description: 'What stands in the way. Later phases read this to know whether this novel has an antagonist at all.' })
  kind: OppositionKind;

  @Field({ optional: true, pattern: '^op_[a-z]+$' })
  optionId?: string;

  @Field({ optional: true, maxLength: ENGINE_NAME_MAX, description: 'The name a person or a system is known by; it becomes the entity the later phases cast.' })
  name?: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'The opposition in one line, as the author would say it.' })
  summary: string;

  @Field({ optional: true, maxLength: ENGINE_TEXT_MAX, description: 'A person’s case in their own voice, edited by the author.' })
  argument?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  wants?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  neverWill?: string;

  @Field(() => [OppositionFaceChoice], { optional: true, maxItems: OPPOSITION_FACES_MAX })
  faces?: OppositionFaceChoice[];

  @Field(() => [String], { optional: true, maxItems: OPPOSITION_GOALS_MAX, description: 'The slice-of-life ladder of small goals, in the order they are wanted.' })
  goals?: string[];

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  rhythm?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'What every win that feeds the protagonist’s own lie costs them.' })
  costOfWinning?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  stakes?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  returnsFor?: string;

  @Field({ optional: true, maxLength: OPPOSITION_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX, description: 'What the opposition means for whoever writes chapter one.' })
  writerLine: string;
}

/**
 * What opposes this novel's protagonist: the locked kind, or slice of life when the reader promise never asked the question. It is the
 * one reader for later phases, so a novel that skipped the screen and one that chose "nothing" answer the same way.
 */
export function oppositionKind(ledger: StageLedgerEntry[]): OppositionKind | null {
  if (!promiseTailoringApplies('opposition', ledger)) return 'slice';
  const decided = [...ledger].reverse().find(entry => entry.topic === OPPOSITION_TOPIC && isDecided(entry));
  const kind = (decided?.payload as { kind?: unknown } | null | undefined)?.kind;
  return isOppositionKind(kind) ? kind : null;
}

export function hasAntagonist(ledger: StageLedgerEntry[]): boolean {
  const kind = oppositionKind(ledger);
  return kind !== null && kind !== 'slice';
}

function statement(selection: OppositionSelection): string {
  const named = selection.name?.trim() ? ` — ${selection.name.trim()}` : '';
  return `${OPPOSITION_KIND_LABELS[selection.kind]}${named}: ${selection.summary.trim()}`;
}

/** Every heading every kind can write, so switching kinds clears the sections the previous one left behind. */
function pageSections(selection: OppositionSelection): { heading: string; body: string }[] {
  const goals = (selection.goals ?? []).map(goal => goal.trim()).filter(Boolean);
  const faces = (selection.faces ?? []).filter(face => face.arc.trim() && face.face.trim());
  return [
    { heading: 'The case', body: selection.argument?.trim() ?? '' },
    { heading: 'What it wants', body: selection.wants?.trim() ?? '' },
    { heading: 'The line it will never cross', body: selection.neverWill?.trim() ?? '' },
    { heading: 'The faces it wears', body: faces.map(face => `- **${face.arc.trim()}**: ${face.face.trim()}`).join('\n') },
    { heading: 'Small goals', body: goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n') },
    { heading: 'Rhythm', body: selection.rhythm?.trim() ?? '' },
    { heading: 'What winning the wrong way costs', body: selection.costOfWinning?.trim() ?? '' },
    { heading: 'Gentle stakes', body: selection.stakes?.trim() ?? '' },
    { heading: 'What the reader returns for', body: selection.returnsFor?.trim() ?? '' },
    { heading: 'What it means for the writer', body: selection.writerLine.trim() },
  ];
}

/** The whole answer, not only the kind: the screen reads it back so a revisit locks what the author decided rather than what the round happens to offer. */
function answerPayload(selection: OppositionSelection): Record<string, unknown> {
  const goals = (selection.goals ?? []).map(goal => goal.trim()).filter(Boolean);
  const faces = (selection.faces ?? []).filter(face => face.arc.trim() && face.face.trim());
  return {
    kind: selection.kind,
    summary: selection.summary.trim(),
    ...(selection.name?.trim() ? { name: selection.name.trim() } : {}),
    ...(selection.argument?.trim() ? { argument: selection.argument.trim() } : {}),
    ...(selection.wants?.trim() ? { wants: selection.wants.trim() } : {}),
    ...(selection.neverWill?.trim() ? { neverWill: selection.neverWill.trim() } : {}),
    ...(faces.length > 0 ? { faces: faces.map(face => ({ arc: face.arc.trim(), face: face.face.trim() })) } : {}),
    ...(goals.length > 0 ? { goals } : {}),
    ...(selection.rhythm?.trim() ? { rhythm: selection.rhythm.trim() } : {}),
    ...(selection.costOfWinning?.trim() ? { costOfWinning: selection.costOfWinning.trim() } : {}),
    ...(selection.stakes?.trim() ? { stakes: selection.stakes.trim() } : {}),
    ...(selection.returnsFor?.trim() ? { returnsFor: selection.returnsFor.trim() } : {}),
  };
}

function entityOp(selection: OppositionSelection, entityKey: string, type: 'character' | 'faction'): ContentOp {
  const body = [
    selection.summary.trim(),
    selection.argument?.trim() ? `> ${selection.argument.trim()}` : null,
    selection.neverWill?.trim() ? `Never: ${selection.neverWill.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  const wants = selection.wants?.trim();
  return {
    op: 'entity.upsert',
    entityKey,
    type,
    name: selection.name?.trim() ?? shortName(selection.summary),
    status: 'Opposition',
    ...(wants ? { motivation: wants } : {}),
    body,
  };
}

function assertSelection(selection: OppositionSelection): void {
  if (!selection.summary.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what stands in the way, in one line' });
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the opposition means for whoever writes chapter one' });
  if (OPPOSITION_ENTITY_KINDS[selection.kind] !== null && !selection.name?.trim())
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `name the ${OPPOSITION_KIND_LABELS[selection.kind].toLowerCase()} that stands in the way` });
  if (selection.kind === 'slice' && (selection.goals ?? []).filter(goal => goal.trim()).length === 0)
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'slice of life replaces opposition with small goals, so name at least one' });
  if (selection.kind === 'self' && !selection.costOfWinning?.trim())
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what every win that feeds the lie costs them' });
}

export const oppositionStep: SourcedScreenStep<EngineOptions, OppositionSliceOptions | null, OppositionSelection> = {
  kind: 'screen',
  key: OPPOSITION_STEP_KEY,
  phase: 'core',
  required: true,
  completionTopics: [OPPOSITION_TOPIC],
  nudges: ['Harder', 'Softer', 'More personal', 'Give them a weakness'],
  appliesWhen: ledger => promiseTailoringApplies('opposition', ledger),
  selectionSchema: OppositionSelection,
  source: { step: ENGINE_STEP_KEY, select: options => options.opposition ?? null },

  describeView(view) {
    return (view?.forms ?? []).map(form => ({ id: form.id, label: `${form.label}: ${form.summary}` }));
  },

  chosenOptionIds(selection) {
    return selection.optionId ? [selection.optionId] : [];
  },

  /**
   * A person or a system becomes an entity the later phases can cast; nature, the protagonist's own lie and slice of life become no
   * one, and the decision's `kind` is what those phases read instead of looking for an antagonist that was never chosen.
   */
  async materialise(selection, { round, ledger, project, tx }) {
    assertSelection(selection);

    const entityType = OPPOSITION_ENTITY_KINDS[selection.kind];
    const entityKey = entityType === null ? null : contentKey('', selection.name?.trim() ?? selection.summary, new Set());
    const body = upsertPageSections(await loadPageBody(tx, project.id, OPPOSITION_PAGE), 'Opposition', statement(selection), pageSections(selection));

    const links: Ledger.Links = { bibleDocuments: [OPPOSITION_PAGE], ...(entityKey ? { entityKeys: [entityKey] } : {}) };
    const changeSet: ContentOp[] = [
      ...(entityKey && entityType ? [entityOp(selection, entityKey, entityType)] : []),
      { op: 'bible_document.upsert', ...OPPOSITION_PAGE, body },
      ...removedContentOps(lockedLinks(ledger, OPPOSITION_STEP_KEY), links),
    ];

    const offered = round?.options?.forms ?? [];
    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: OPPOSITION_TOPIC,
          statement: statement(selection),
          why: selection.why?.trim() || (selection.kind === round?.options?.preselected ? (round?.options?.why ?? null) : null),
          writerLine: selection.writerLine.trim(),
          rejectedAlternatives: offered.filter(form => form.kind !== selection.kind).map(form => `${form.label}: ${form.summary}`),
          payload: { ...answerPayload(selection), ...(entityKey ? { entityKey } : {}) },
          links,
        },
      ],
      changeSet,
      summary: 'Blueprint: what stands in the way',
    };
    return plan;
  },
};
