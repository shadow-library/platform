import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import {
  CAST_LADDER_RUNGS_MAX,
  CAST_MEMBERS_MAX,
  LATER_CAST_MAX,
  VOLUME_ONE_LINE_MAX,
  VOLUME_ONE_NAME_MAX,
  VOLUME_ONE_WRITER_LINE_MAX,
} from '../../ai/schemas/blueprint-volume-one.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type PlannedLedgerEntry, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { loadPageBody, upsertPageSections } from './bible-page';
import { contentKey, lockedLinks, removedContentOps } from './content-keys';
import { lockedCastKeys } from './locked-cast';
import { CAST_PAGE } from './protagonist.step';
import { type CastSliceOptions, VOLUME_ONE_PASS_STEP_KEY, type VolumeOneOptions } from './volume-one-pass.step';

export const CAST_STEP_KEY = 'cast';
export const CAST_TOPIC = 'cast';
export const CAST_LADDER_TOPIC = 'cast.ladder';
export const CAST_WHY_MAX = 400;

const VOLUME_ONE_HEADING = 'Volume one';
const LATER_HEADING = 'Later volumes';
const LADDER_HEADING = 'Relationship ladder';

export const CAST_DECIDED_BY = ['author', 'system'] as const;

export type CastDecidedBy = (typeof CAST_DECIDED_BY)[number];

@Schema()
export class CastMemberChoice {
  @Field({ optional: true, pattern: '^cm[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  descriptor: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX })
  role?: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_LINE_MAX })
  wants?: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_LINE_MAX })
  doesInVolumeOne?: string;

  @Field(() => String, { enum: [...CAST_DECIDED_BY], description: 'Who settled this card: the author, or the system on their behalf. A system card can be overruled later.' })
  decidedBy: CastDecidedBy;
}

@Schema()
export class LaterCastChoice {
  @Field({ optional: true, pattern: '^lc[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  line: string;

  @Field(() => Integer, { minimum: 2 })
  volume: number;
}

@Schema()
export class CastLadderRungChoice {
  @Field({ optional: true, pattern: '^lr[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_LINE_MAX })
  meaning?: string;
}

@Schema()
export class CastLadderChoice {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  first: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  second: string;

  @Field(() => [CastLadderRungChoice], { minItems: 2, maxItems: CAST_LADDER_RUNGS_MAX, description: 'The rungs the relationship climbs; the arcs screen places them.' })
  rungs: CastLadderRungChoice[];
}

@Schema()
export class CastSelection {
  @Field(() => [CastMemberChoice], { minItems: 1, maxItems: CAST_MEMBERS_MAX, description: 'Only the characters volume one needs, besides the protagonist and the opposition.' })
  members: CastMemberChoice[];

  @Field(() => [LaterCastChoice], { optional: true, maxItems: LATER_CAST_MAX })
  later?: LaterCastChoice[];

  @Field(() => CastLadderChoice, { optional: true })
  ladder?: CastLadderChoice;

  @Field({ optional: true, maxLength: CAST_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_WRITER_LINE_MAX, description: 'What this cast means for whoever writes chapter one.' })
  writerLine: string;
}

interface KeyedMember {
  member: CastMemberChoice;
  entityKey: string;
  /** A character the Core phase already made: reused as-is, never written over and never removed by this step. */
  existing: boolean;
}

function keyMembers(members: CastMemberChoice[], known: Set<string>): KeyedMember[] {
  const taken = new Set<string>();
  return members.map(member => {
    const entityKey = contentKey('', member.name, taken);
    return { member, entityKey, existing: known.has(entityKey) };
  });
}

function memberBody(member: CastMemberChoice): string {
  const lines = [`**${member.name.trim()}** — ${member.descriptor.trim()}`];
  if (member.role?.trim()) lines.push(`- Role: ${member.role.trim()}`);
  if (member.wants?.trim()) lines.push(`- Wants: ${member.wants.trim()}`);
  if (member.doesInVolumeOne?.trim()) lines.push(`- In volume one: ${member.doesInVolumeOne.trim()}`);
  return lines.join('\n');
}

function entityOp({ member, entityKey }: KeyedMember): ContentOp {
  return {
    op: 'entity.upsert',
    entityKey,
    type: 'character',
    name: member.name.trim(),
    ...(member.role?.trim() ? { status: member.role.trim() } : {}),
    ...(member.wants?.trim() ? { motivation: member.wants.trim() } : {}),
    notes: member.decidedBy === 'system' ? 'Detail decided by the system; the author may overrule it.' : 'Decided by the author.',
    body: memberBody(member),
  };
}

function ladderLine(ladder: CastLadderChoice): string {
  return `${ladder.first.trim()} and ${ladder.second.trim()}: ${ladder.rungs.map(rung => rung.name.trim()).join(' → ')}`;
}

function ladderSection(ladder: CastLadderChoice | undefined): string {
  if (!ladder) return '';
  const rungs = ladder.rungs.map(rung => `- **${rung.name.trim()}**${rung.meaning?.trim() ? ` — ${rung.meaning.trim()}` : ''}`);
  return [`**${ladder.first.trim()} and ${ladder.second.trim()}**`, ...rungs].join('\n');
}

function castBody(current: string | null, keyed: KeyedMember[], later: LaterCastChoice[], ladder: CastLadderChoice | undefined): string {
  return upsertPageSections(current, 'Cast', null, [
    { heading: VOLUME_ONE_HEADING, body: keyed.map(memberOf => memberBody(memberOf.member)).join('\n\n') },
    { heading: LATER_HEADING, body: later.map(member => `- **${member.name.trim()}** (volume ${member.volume}) — ${member.line.trim()}`).join('\n') },
    { heading: LADDER_HEADING, body: ladderSection(ladder) },
  ]);
}

/** The cards an earlier lock handed to the system, named by the key those entries answer for. */
function delegatedBefore(ledger: Ledger.Entry[]): string[] {
  return ledger
    .filter(entry => entry.kind === 'system' && entry.stepKey === CAST_STEP_KEY && entry.topic === CAST_TOPIC)
    .map(entry => (entry.payload as { optionId?: unknown } | null)?.optionId)
    .filter((optionId): optionId is string => typeof optionId === 'string');
}

function assertSelection(selection: CastSelection): void {
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what this cast means for whoever writes chapter one' });
  const names = selection.members.map(member => member.name.trim().toLowerCase());
  if (names.some(name => !name)) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every card needs a name' });
  if (new Set(names).size !== names.length) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the same character is on two cards' });
  const ladder = selection.ladder;
  if (ladder && ladder.first.trim().toLowerCase() === ladder.second.trim().toLowerCase()) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the relationship ladder names the same person twice' });
  }
}

export const castStep: SourcedScreenStep<VolumeOneOptions, CastSliceOptions | null, CastSelection> = {
  kind: 'screen',
  key: CAST_STEP_KEY,
  phase: 'volume_one',
  required: true,
  completionTopics: [CAST_TOPIC],
  nudges: ['Add a rival', 'Add a love interest', 'Fewer characters', 'Someone who disagrees with the protagonist'],
  selectionSchema: CastSelection,
  source: { step: VOLUME_ONE_PASS_STEP_KEY, select: options => options.cast ?? null },

  describeView(view) {
    return [
      ...(view?.members ?? []).map(member => ({ id: member.id, label: `${member.name} — ${member.descriptor}` })),
      ...(view?.later ?? []).map(member => ({ id: member.id, label: `${member.name} — ${member.line}` })),
      ...(view?.ladder?.rungs ?? []).map(rung => ({ id: rung.id, label: `${rung.name}: ${rung.meaning}` })),
    ];
  },

  chosenOptionIds(selection) {
    return [
      ...selection.members.flatMap(member => (member.optionId ? [member.optionId] : [])),
      ...(selection.later ?? []).flatMap(member => (member.optionId ? [member.optionId] : [])),
      ...(selection.ladder?.rungs ?? []).flatMap(rung => (rung.optionId ? [rung.optionId] : [])),
    ];
  },

  /**
   * The cast decision names everyone volume one needs; a card the author handed to the system gets its own `system` entry keyed by the
   * character, so overruling one detail later supersedes that entry alone. The protagonist and the opposition are reused, never rewritten.
   */
  async materialise(selection, { ledger, project, tx }) {
    assertSelection(selection);
    const known = lockedCastKeys(ledger);
    const keyed = keyMembers(selection.members, known);
    const previous = lockedLinks(ledger, CAST_STEP_KEY);
    const later = (selection.later ?? []).filter(member => member.name.trim() && member.line.trim());
    const ladder = selection.ladder;
    const page = await loadPageBody(tx, project.id, CAST_PAGE);

    const mine = keyed.filter(member => !member.existing);
    const links: Ledger.Links = { bibleDocuments: [CAST_PAGE], entityKeys: mine.map(member => member.entityKey) };
    const changeSet: ContentOp[] = [
      ...mine.map(entityOp),
      { op: 'bible_document.upsert', ...CAST_PAGE, body: castBody(page, keyed, later, ladder) },
      ...removedContentOps(previous, links, known),
    ];

    const entries: PlannedLedgerEntry[] = [
      {
        kind: 'decision',
        topic: CAST_TOPIC,
        statement: keyed.map(({ member }) => member.name.trim()).join(', '),
        why: selection.why?.trim() || null,
        writerLine: selection.writerLine.trim(),
        payload: {
          members: keyed.map(({ member, entityKey, existing }) => ({
            entityKey,
            existing,
            name: member.name.trim(),
            descriptor: member.descriptor.trim(),
            role: member.role?.trim() ?? '',
            wants: member.wants?.trim() ?? '',
            doesInVolumeOne: member.doesInVolumeOne?.trim() ?? '',
            decidedBy: member.decidedBy,
          })),
          later: later.map(member => ({ name: member.name.trim(), line: member.line.trim(), volume: member.volume })),
        },
        links,
      },
      ...keyed
        .filter(({ member }) => member.decidedBy === 'system')
        .map(({ member, entityKey }): PlannedLedgerEntry => ({
          kind: 'system',
          topic: CAST_TOPIC,
          statement: `${member.name.trim()} — ${member.descriptor.trim()}`,
          decidedBy: 'system',
          payload: { optionId: entityKey },
        })),
    ];

    if (ladder && ladder.rungs.length > 0) {
      entries.push({
        kind: 'decision',
        topic: CAST_LADDER_TOPIC,
        statement: ladderLine(ladder),
        payload: {
          first: ladder.first.trim(),
          second: ladder.second.trim(),
          rungs: ladder.rungs.map(rung => ({ name: rung.name.trim(), meaning: rung.meaning?.trim() ?? '' })),
        },
        links: { bibleDocuments: [CAST_PAGE] },
      });
    }

    const plan: LockPlan = {
      entries,
      changeSet,
      summary: 'Blueprint: the cast volume one needs',
      replaces: [CAST_TOPIC, CAST_LADDER_TOPIC],
      // Every card this lock speaks to AND every one an earlier lock did, so dropping a character retires their system entry even when
      // this answer writes no system entry of its own for the reconciler to recognise the kind by.
      retires: [...new Set([...keyed.map(({ entityKey }) => entityKey), ...(previous.entityKeys ?? []), ...delegatedBefore(ledger)])],
    };
    return plan;
  },
};
