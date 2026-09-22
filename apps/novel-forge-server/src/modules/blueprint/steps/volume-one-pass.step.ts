import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintVolumeOnePrompt } from '../../ai/prompts/blueprint-volume-one.prompt';
import {
  ARC_CHAPTERS_MAX,
  ARC_CHAPTERS_MIN,
  ARCS_MAX,
  BACKLOG_MAX,
  type BlueprintArcsOut,
  type BlueprintCastOut,
  type BlueprintPlacesOut,
  type BlueprintVolumeOneOutput,
  CAST_LADDER_RUNGS_MAX,
  CAST_MEMBERS_MAX,
  LATER_CAST_MAX,
  PLACE_DEPTHS,
  PLACE_KINDS,
  type PlaceDepth,
  type PlaceKind,
  PLACES_MAX,
  VOLUME_ONE_LINE_MAX,
  VOLUME_ONE_NAME_MAX,
} from '../../ai/schemas/blueprint-volume-one.schema';
import { type PassStep, type StepInputContext, type StepOption } from '../engine/blueprint-step.types';
import { lockedCast, renderLockedCast, renderLockedOpposition } from './locked-cast';
import { planningSections } from './planning-context';
import { SPINE_REVEALS_TOPIC, SPINE_TOPIC } from './spine.step';

export const VOLUME_ONE_PASS_STEP_KEY = 'volume_one_pass';
export const VOLUME_ONE_BUDGET_TOKENS = 44_000;

/** The pass's parts, each named after the screen that reviews it: a focused round is a round on one of these and nothing else. */
export const VOLUME_ONE_SLICES = ['cast', 'places', 'arcs'] as const;

export type VolumeOneSlice = (typeof VOLUME_ONE_SLICES)[number];

@Schema()
export class CastMemberOption {
  @Field({ pattern: '^cm[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  descriptor: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  role: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  wants: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  doesInVolumeOne: string;

  @Field({ description: 'A minor player: the screen offers their detail to the system rather than asking the author for it.' })
  minor: boolean;
}

@Schema()
export class LaterCastOption {
  @Field({ pattern: '^lc[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  line: string;

  @Field(() => Integer, { minimum: 2 })
  volume: number;
}

@Schema()
export class CastLadderRungOption {
  @Field({ pattern: '^lr[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  meaning: string;
}

@Schema()
export class CastLadderOption {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  first: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  second: string;

  @Field(() => [CastLadderRungOption], { maxItems: CAST_LADDER_RUNGS_MAX })
  rungs: CastLadderRungOption[];
}

@Schema()
export class CastSliceOptions {
  @Field(() => [CastMemberOption], { maxItems: CAST_MEMBERS_MAX })
  members: CastMemberOption[];

  @Field(() => [LaterCastOption], { maxItems: LATER_CAST_MAX })
  later: LaterCastOption[];

  @Field(() => CastLadderOption, { optional: true })
  ladder?: CastLadderOption;
}

@Schema()
export class PlaceOption {
  @Field({ pattern: '^pl[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field(() => String, { enum: [...PLACE_KINDS] })
  kind: PlaceKind;

  @Field(() => String, { enum: [...PLACE_DEPTHS] })
  detail: PlaceDepth;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  summary: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX })
  usedIn?: string;
}

@Schema()
export class BacklogOption {
  @Field({ pattern: '^bl[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  item: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  why: string;
}

@Schema()
export class PlacesSliceOptions {
  @Field(() => [PlaceOption], { maxItems: PLACES_MAX })
  places: PlaceOption[];

  @Field(() => [BacklogOption], { maxItems: BACKLOG_MAX })
  backlog: BacklogOption[];
}

@Schema()
export class ArcOption {
  @Field({ pattern: '^ac[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  purpose: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'What is true after this arc that was not true before it.' })
  turn: string;

  @Field(() => Integer, { minimum: ARC_CHAPTERS_MIN, maximum: ARC_CHAPTERS_MAX })
  chapters: number;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX, description: 'The relationship rung this arc lands, named as the cast ladder names it.' })
  rung?: string;
}

@Schema()
export class ArcsSliceOptions {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  volumeTitle: string;

  @Field(() => Integer, { minimum: 0, description: 'How long volume one runs, as the spine set it: the arcs are finally tiled across exactly this many chapters.' })
  volumeChapters: number;

  @Field(() => [ArcOption], { maxItems: ARCS_MAX })
  arcs: ArcOption[];
}

@Schema()
export class VolumeOneOptions {
  @Field(() => CastSliceOptions, { optional: true })
  cast?: CastSliceOptions;

  @Field(() => PlacesSliceOptions, { optional: true })
  places?: PlacesSliceOptions;

  @Field(() => ArcsSliceOptions, { optional: true })
  arcs?: ArcsSliceOptions;
}

export interface VolumeOneMovement {
  volumeKey: string;
  title: string;
  summary: string;
  change: string;
  chapters: number;
}

/** Volume one as the spine sketched it: the movement this phase zooms into, and the only one it may detail. */
export function firstMovement(ledger: Ledger.Entry[]): VolumeOneMovement | null {
  const spine = [...ledger].reverse().find(entry => entry.topic === SPINE_TOPIC && entry.kind === 'decision');
  const movements = (spine?.payload as { movements?: unknown } | null | undefined)?.movements;
  const first = Array.isArray(movements) ? movements[0] : undefined;
  if (typeof first !== 'object' || first === null) return null;
  const movement = first as Partial<VolumeOneMovement>;
  return typeof movement.volumeKey === 'string' && typeof movement.title === 'string'
    ? {
        volumeKey: movement.volumeKey,
        title: movement.title,
        summary: typeof movement.summary === 'string' ? movement.summary : '',
        change: typeof movement.change === 'string' ? movement.change : '',
        chapters: typeof movement.chapters === 'number' ? movement.chapters : 0,
      }
    : null;
}

function castSlice(output: BlueprintCastOut, known: Set<string>): CastSliceOptions {
  const members = output.members
    .filter(member => !known.has(member.name.trim().toLowerCase()))
    .map((member, index) => ({
      id: `cm${index + 1}`,
      name: member.name.trim(),
      descriptor: member.descriptor.trim(),
      role: member.role.trim(),
      wants: member.wants.trim(),
      doesInVolumeOne: member.doesInVolumeOne.trim(),
      minor: member.minor === true,
    }));
  const later = (output.later ?? []).map((member, index) => ({ id: `lc${index + 1}`, name: member.name.trim(), line: member.line.trim(), volume: member.volume }));
  const ladder = {
    first: output.ladder.first.trim(),
    second: output.ladder.second.trim(),
    rungs: output.ladder.rungs.map((rung, index) => ({ id: `lr${index + 1}`, name: rung.name.trim(), meaning: rung.meaning.trim() })),
  };
  return { members, later, ladder };
}

function placesSlice(output: BlueprintPlacesOut): PlacesSliceOptions {
  return {
    places: output.places.map((place, index) => ({
      id: `pl${index + 1}`,
      name: place.name.trim(),
      kind: place.kind as PlaceKind,
      detail: place.detail as PlaceDepth,
      summary: place.summary.trim(),
      ...(place.usedIn?.trim() ? { usedIn: place.usedIn.trim() } : {}),
    })),
    backlog: (output.backlog ?? []).map((item, index) => ({ id: `bl${index + 1}`, item: item.item.trim(), why: item.why.trim() })),
  };
}

function arcsSlice(output: BlueprintArcsOut, ledger: Ledger.Entry[]): ArcsSliceOptions {
  return {
    volumeTitle: output.volumeTitle.trim(),
    volumeChapters: firstMovement(ledger)?.chapters ?? 0,
    arcs: output.arcs.map((arc, index) => ({
      id: `ac${index + 1}`,
      title: arc.title.trim(),
      purpose: arc.purpose.trim(),
      turn: arc.turn.trim(),
      chapters: arc.chapters,
      ...(arc.rung?.trim() ? { rung: arc.rung.trim() } : {}),
    })),
  };
}

function freshSlices(output: BlueprintVolumeOneOutput, known: Set<string>, ledger: Ledger.Entry[]): VolumeOneOptions {
  return {
    ...(output.cast ? { cast: castSlice(output.cast, known) } : {}),
    ...(output.places ? { places: placesSlice(output.places) } : {}),
    ...(output.arcs ? { arcs: arcsSlice(output.arcs, ledger) } : {}),
  };
}

/**
 * The merge is code, not a promise the model keeps: a focused round takes its own slice from the round and every other slice from the
 * options the author is already looking at, byte for byte, so steering one screen can never move what another screen has on it.
 */
export function mergeVolumeOneSlices(previous: VolumeOneOptions | null, fresh: VolumeOneOptions, focus: string | null): VolumeOneOptions {
  const take = <K extends VolumeOneSlice>(slice: K): VolumeOneOptions[K] => (focus !== null && slice !== focus ? previous?.[slice] : (fresh[slice] ?? previous?.[slice]));
  const cast = take('cast');
  const places = take('places');
  const arcs = take('arcs');
  return { ...(cast ? { cast } : {}), ...(places ? { places } : {}), ...(arcs ? { arcs } : {}) };
}

/** The reveal the spine pinned, named by where it comes out. Its truth is already in the notebook; an arc's purpose and turn are not the place for it. */
function pinnedReveal(ledger: Ledger.Entry[]): string | null {
  const schedule = [...ledger].reverse().find(entry => entry.topic === SPINE_REVEALS_TOPIC && entry.kind === 'decision');
  const reveals = (schedule?.payload as { reveals?: unknown } | null | undefined)?.reveals;
  const first = Array.isArray(reveals) ? reveals[0] : undefined;
  if (typeof first !== 'object' || first === null) return null;
  const { when, movement } = first as { when?: unknown; movement?: unknown };
  return typeof when === 'string' && when.trim() && movement === 1 ? when.trim() : null;
}

function renderScope(slices: VolumeOneSlice[], ledger: Ledger.Entry[]): string {
  const movement = firstMovement(ledger);
  const asked = slices.length === 1 ? `Produce only the ${slices[0]} part this round.` : `Produce these parts this round: ${slices.join(', ')}.`;
  const volume = movement
    ? `Volume one is "${movement.title}" — ${movement.summary} The protagonist ends it ${movement.change}. It runs for ${movement.chapters} chapters, and the arcs must add up to that.`
    : 'The spine has not been locked yet; plan volume one from the notebook and keep it short.';
  const reveal = pinnedReveal(ledger);
  return [
    asked,
    'Leave every other part out of the JSON entirely.',
    volume,
    `Already locked, and never to be invented again:\n${renderLockedCast(lockedCast(ledger))}`,
    `The opposition these arcs have to escalate:\n${renderLockedOpposition(ledger)}`,
    reveal ? `The spine pins one reveal inside volume one, at "${reveal}": one arc lands it, and its turn is what the reveal changes.` : 'No reveal is pinned inside volume one.',
  ].join('\n');
}

function renderKept(options: VolumeOneOptions, focus: VolumeOneSlice): string | null {
  const blocks: string[] = [];
  if (focus !== 'cast' && options.cast) {
    const members = options.cast.members.map(member => `- ${member.name} (${member.role}): ${member.descriptor}`).join('\n');
    const ladder = options.cast.ladder
      ? `\nLadder — ${options.cast.ladder.first} and ${options.cast.ladder.second}: ${options.cast.ladder.rungs.map(rung => rung.name).join(' → ')}`
      : '';
    blocks.push(`Volume-one cast on the author's screen:\n${members}${ladder}`);
  }
  if (focus !== 'places' && options.places) {
    blocks.push(
      `Places and factions on the author's screen:\n${options.places.places.map(place => `- ${place.name} (${place.kind}, ${place.detail}): ${place.summary}`).join('\n')}`,
    );
  }
  if (focus !== 'arcs' && options.arcs) {
    blocks.push(`Arcs on the author's screen:\n${options.arcs.arcs.map(arc => `- ${arc.title} (${arc.chapters} ch): ${arc.purpose}`).join('\n')}`);
  }
  return blocks.length > 0 ? `${blocks.join('\n\n')}\n\nThese parts are not yours to change this round; make what you write fit them.` : null;
}

export const volumeOnePass: PassStep<BlueprintVolumeOneOutput, VolumeOneOptions, never> = {
  kind: 'pass',
  key: VOLUME_ONE_PASS_STEP_KEY,
  phase: 'volume_one',
  nudges: [],
  prompt: blueprintVolumeOnePrompt,
  optionsSchema: VolumeOneOptions,
  budgetTokens: VOLUME_ONE_BUDGET_TOKENS,

  async inputs(context: StepInputContext<VolumeOneOptions>): Promise<BlueprintInputSection[]> {
    const focus = VOLUME_ONE_SLICES.find(slice => slice === context.focus) ?? null;
    const asked = focus ? [focus] : [...VOLUME_ONE_SLICES];
    const sections: BlueprintInputSection[] = [{ key: 'volume_one_scope', content: renderScope(asked, context.ledger), required: true }];
    sections.push(...(await planningSections(context)));
    const kept = focus && context.previous ? renderKept(context.previous, focus) : null;
    if (kept) sections.push({ key: 'volume_one_so_far', content: kept });
    return sections;
  },

  toRound(output, { previous, focus, ledger }) {
    const known = new Set(lockedCast(ledger).map(character => character.name.trim().toLowerCase()));
    const options = mergeVolumeOneSlices(previous, freshSlices(output, known, ledger), focus);
    if (Object.keys(options).length === 0) throw AppErrorCode.AI_001.create();
    return { options, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    const members = (options.cast?.members ?? []).map((member): StepOption => ({ id: member.id, label: `${member.name} — ${member.descriptor}` }));
    const later = (options.cast?.later ?? []).map((member): StepOption => ({ id: member.id, label: `${member.name} — ${member.line}` }));
    const rungs = (options.cast?.ladder?.rungs ?? []).map((rung): StepOption => ({ id: rung.id, label: `${rung.name}: ${rung.meaning}` }));
    const places = (options.places?.places ?? []).map((place): StepOption => ({ id: place.id, label: `${place.name} — ${place.summary}` }));
    const backlog = (options.places?.backlog ?? []).map((item): StepOption => ({ id: item.id, label: item.item }));
    const arcs = (options.arcs?.arcs ?? []).map((arc): StepOption => ({ id: arc.id, label: `${arc.title} — ${arc.purpose}` }));
    return [...members, ...later, ...rungs, ...places, ...backlog, ...arcs];
  },
};
