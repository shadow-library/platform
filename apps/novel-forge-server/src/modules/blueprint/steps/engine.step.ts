import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { OPPOSITION_KIND_LABELS, OPPOSITION_KINDS, type OppositionKind } from '@shadow-library/sdk';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintEnginePrompt } from '../../ai/prompts/blueprint-engine.prompt';
import {
  type BlueprintEngineOutput,
  type BlueprintOppositionOut,
  type BlueprintPowerOut,
  type BlueprintProtagonistOut,
  type BlueprintWorldOut,
  COST_RULES_MAX,
  ENGINE_LINE_MAX,
  ENGINE_NAME_MAX,
  ENGINE_TEXT_MAX,
  ENGINE_WRITER_LINE_MAX,
  LADDER_RUNGS_MAX,
  OPPOSITION_FACES_MAX,
  OPPOSITION_GOALS_MAX,
  PROTAGONIST_LEADS_MAX,
  PROTAGONIST_VERSIONS,
  WORLD_HONOURED_MAX,
  WORLD_RULES_MAX,
} from '../../ai/schemas/blueprint-engine.schema';
import { type PassStep, type StepInputContext, type StepOption } from '../engine/blueprint-step.types';
import { type StageLedgerEntry } from '../stage/blueprint-stage';
import { promiseTailoringApplies } from '../stage/promise-tailoring';

export const ENGINE_STEP_KEY = 'engine';
export const ENGINE_BUDGET_TOKENS = 36_000;

/** The pass's parts, each named after the screen that reviews it: a focused round is a round on one of these and nothing else. */
export const ENGINE_SLICES = ['protagonist', 'opposition', 'world', 'power'] as const;

export type EngineSlice = (typeof ENGINE_SLICES)[number];

@Schema()
export class ProtagonistLeadOption {
  @Field({ pattern: '^l[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  descriptor: string;
}

@Schema()
export class ProtagonistVersionOption {
  @Field({ pattern: '^pv[0-9]+$' })
  id: string;

  @Field({ pattern: '^l[0-9]+$' })
  leadId: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  lie: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  wound: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  want: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  need: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  change: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  chapterOne: string;
}

@Schema()
export class ProtagonistSliceOptions {
  @Field(() => [ProtagonistLeadOption], { maxItems: PROTAGONIST_LEADS_MAX })
  leads: ProtagonistLeadOption[];

  @Field(() => [ProtagonistVersionOption], { maxItems: PROTAGONIST_LEADS_MAX * PROTAGONIST_VERSIONS })
  versions: ProtagonistVersionOption[];
}

@Schema()
export class OppositionFaceOption {
  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  arc: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  face: string;
}

@Schema()
export class OppositionFormOption {
  @Field({ pattern: '^op_[a-z]+$' })
  id: string;

  @Field(() => String, { enum: [...OPPOSITION_KINDS] })
  kind: OppositionKind;

  @Field({ minLength: 1 })
  label: string;

  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  summary: string;

  @Field({ optional: true, maxLength: ENGINE_TEXT_MAX, description: 'A person’s case in their own voice, editable by the author.' })
  argument?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  wants?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  neverWill?: string;

  @Field(() => [OppositionFaceOption], { optional: true, maxItems: OPPOSITION_FACES_MAX, description: 'A system has no single villain: this is the face it wears per arc.' })
  faces?: OppositionFaceOption[];

  @Field(() => [String], { optional: true, maxItems: OPPOSITION_GOALS_MAX, description: 'The slice-of-life ladder that replaces opposition.' })
  goals?: string[];

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  rhythm?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'What every win that feeds the protagonist’s own lie costs them.' })
  costOfWinning?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  stakes?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX })
  returnsFor?: string;
}

@Schema()
export class OppositionSliceOptions {
  @Field(() => String, { enum: [...OPPOSITION_KINDS], description: 'The kind the reader promise points at; the author may take any of them.' })
  preselected: OppositionKind;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  why: string;

  @Field(() => [OppositionFormOption], { maxItems: OPPOSITION_KINDS.length })
  forms: OppositionFormOption[];
}

@Schema()
export class CostRuleOption {
  @Field({ pattern: '^cr[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  rule: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  why: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX })
  writerLine: string;
}

@Schema()
export class WorldRuleOption {
  @Field({ pattern: '^wr[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  rule: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  why: string;
}

@Schema()
export class SocietyOption {
  @Field({ minLength: 1, maxLength: ENGINE_TEXT_MAX })
  order: string;

  @Field({ minLength: 1, maxLength: ENGINE_TEXT_MAX })
  economy: string;
}

@Schema()
export class WorldSliceOptions {
  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  summary: string;

  @Field(() => [CostRuleOption], { maxItems: COST_RULES_MAX })
  costRules: CostRuleOption[];

  @Field(() => [WorldRuleOption], { maxItems: WORLD_RULES_MAX })
  rules: WorldRuleOption[];

  @Field(() => SocietyOption, { optional: true, description: 'Asked for instead of a power ladder when progression does not drive the novel.' })
  society?: SocietyOption;

  @Field(() => [String], { maxItems: WORLD_HONOURED_MAX, description: 'Refused ideas these rules work around, so the screen can show the coach honouring them.' })
  honoured: string[];
}

@Schema()
export class LadderRungOption {
  @Field({ pattern: '^rg[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  buys: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  cost: string;
}

@Schema()
export class PowerSliceOptions {
  @Field(() => [LadderRungOption], { maxItems: LADDER_RUNGS_MAX, description: 'Cheapest rung first.' })
  rungs: LadderRungOption[];

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX })
  note: string;
}

@Schema()
export class EngineOptions {
  @Field(() => ProtagonistSliceOptions, { optional: true })
  protagonist?: ProtagonistSliceOptions;

  @Field(() => OppositionSliceOptions, { optional: true })
  opposition?: OppositionSliceOptions;

  @Field(() => WorldSliceOptions, { optional: true })
  world?: WorldSliceOptions;

  @Field(() => PowerSliceOptions, { optional: true })
  power?: PowerSliceOptions;
}

const TAILORED: Partial<Record<EngineSlice, 'opposition' | 'power_ladder'>> = { opposition: 'opposition', power: 'power_ladder' };

/** Which parts this novel is asked for: the reader promise rules the opposition and the ladder in or out, and nothing else varies. */
export function engineSliceApplies(slice: EngineSlice, ledger: StageLedgerEntry[]): boolean {
  const rule = TAILORED[slice];
  return rule === undefined || promiseTailoringApplies(rule, ledger);
}

function protagonistSlice(output: BlueprintProtagonistOut): ProtagonistSliceOptions {
  const leads = output.leads.map((lead, index) => ({ id: `l${index + 1}`, name: lead.name.trim(), descriptor: lead.descriptor.trim() }));
  let counter = 0;
  const versions = output.leads.flatMap((lead, index) =>
    lead.versions.map(version => ({
      id: `pv${++counter}`,
      leadId: `l${index + 1}`,
      lie: version.lie.trim(),
      wound: version.wound.trim(),
      want: version.want.trim(),
      need: version.need.trim(),
      change: version.change.trim(),
      chapterOne: version.chapterOne.trim(),
    })),
  );
  return { leads, versions };
}

function oppositionSlice(output: BlueprintOppositionOut): OppositionSliceOptions {
  const forms = output.forms.map(form => {
    const kind = form.kind as OppositionKind;
    return {
      id: `op_${kind}`,
      kind,
      label: OPPOSITION_KIND_LABELS[kind],
      name: form.name.trim(),
      summary: form.summary.trim(),
      ...(form.argument?.trim() ? { argument: form.argument.trim() } : {}),
      ...(form.wants?.trim() ? { wants: form.wants.trim() } : {}),
      ...(form.neverWill?.trim() ? { neverWill: form.neverWill.trim() } : {}),
      ...(form.faces?.length ? { faces: form.faces.map(face => ({ arc: face.arc.trim(), face: face.face.trim() })) } : {}),
      ...(form.goals?.length ? { goals: form.goals.map(goal => goal.trim()).filter(Boolean) } : {}),
      ...(form.rhythm?.trim() ? { rhythm: form.rhythm.trim() } : {}),
      ...(form.costOfWinning?.trim() ? { costOfWinning: form.costOfWinning.trim() } : {}),
      ...(form.stakes?.trim() ? { stakes: form.stakes.trim() } : {}),
      ...(form.returnsFor?.trim() ? { returnsFor: form.returnsFor.trim() } : {}),
    };
  });
  return { preselected: output.preselected as OppositionKind, why: output.why.trim(), forms };
}

function worldSlice(output: BlueprintWorldOut): WorldSliceOptions {
  return {
    summary: output.summary.trim(),
    costRules: output.costRules.map((cost, index) => ({ id: `cr${index + 1}`, rule: cost.rule.trim(), why: cost.why.trim(), writerLine: cost.writerLine.trim() })),
    rules: output.rules.map((rule, index) => ({ id: `wr${index + 1}`, rule: rule.rule.trim(), why: rule.why.trim() })),
    ...(output.society ? { society: { order: output.society.order.trim(), economy: output.society.economy.trim() } } : {}),
    honoured: (output.honoured ?? []).map(item => item.trim()).filter(Boolean),
  };
}

function powerSlice(output: BlueprintPowerOut): PowerSliceOptions {
  return {
    rungs: output.rungs.map((rung, index) => ({ id: `rg${index + 1}`, name: rung.name.trim(), buys: rung.buys.trim(), cost: rung.cost.trim() })),
    note: output.note.trim(),
  };
}

function freshSlices(output: BlueprintEngineOutput): EngineOptions {
  return {
    ...(output.protagonist ? { protagonist: protagonistSlice(output.protagonist) } : {}),
    ...(output.opposition ? { opposition: oppositionSlice(output.opposition) } : {}),
    ...(output.world ? { world: worldSlice(output.world) } : {}),
    ...(output.power ? { power: powerSlice(output.power) } : {}),
  };
}

/**
 * The merge is code, not a promise the model keeps: a focused round takes its own slice from the round and every other slice from the
 * options the author is already looking at, byte for byte, so steering one screen can never move what another screen has on it.
 */
export function mergeEngineSlices(previous: EngineOptions | null, fresh: EngineOptions, focus: string | null): EngineOptions {
  const take = <K extends EngineSlice>(slice: K): EngineOptions[K] => (focus !== null && slice !== focus ? previous?.[slice] : (fresh[slice] ?? previous?.[slice]));
  const protagonist = take('protagonist');
  const opposition = take('opposition');
  const world = take('world');
  const power = take('power');
  return { ...(protagonist ? { protagonist } : {}), ...(opposition ? { opposition } : {}), ...(world ? { world } : {}), ...(power ? { power } : {}) };
}

function renderScope(slices: EngineSlice[], ladder: boolean, leads: number): string {
  const asked = slices.length === 1 ? `Produce only the ${slices[0]} part this round.` : `Produce these parts this round: ${slices.join(', ')}.`;
  const rest = 'Leave every other part out of the JSON entirely.';
  const ladderLine = slices.includes('world')
    ? ladder
      ? 'Progression drives this novel, so the ladder is asked for on its own and the world part leaves society out.'
      : 'Progression does not drive this novel, so there is no ladder: answer society and economy in the world part instead.'
    : null;
  const oppositionLine = slices.includes('opposition') ? `Fill in all ${OPPOSITION_KINDS.length} opposition kinds, whichever one is pre-selected.` : null;
  const leadLine = slices.includes('protagonist')
    ? `This novel has ${leads === 2 ? 'two leads' : 'one lead'} today: keep that number unless the round input asks for a different one.`
    : null;
  return [asked, rest, leadLine, ladderLine, oppositionLine].filter((line): line is string => line !== null).join('\n');
}

function renderLead(slice: ProtagonistSliceOptions): string {
  const lines = slice.leads.map(lead => {
    const lies = slice.versions.filter(version => version.leadId === lead.id).map(version => `  - ${version.lie}`);
    return [`- ${lead.name} (${lead.descriptor})`, ...lies].join('\n');
  });
  return `Protagonist versions on the author's screen:\n${lines.join('\n')}`;
}

function renderKept(options: EngineOptions, focus: EngineSlice): string | null {
  const blocks: string[] = [];
  if (focus !== 'protagonist' && options.protagonist) blocks.push(renderLead(options.protagonist));
  if (focus !== 'opposition' && options.opposition)
    blocks.push(
      `Opposition on the author's screen (pre-selected: ${options.opposition.preselected}):\n${options.opposition.forms.map(form => `- ${form.label}: ${form.summary}`).join('\n')}`,
    );
  if (focus !== 'world' && options.world) blocks.push(`World on the author's screen: ${options.world.summary}\n${options.world.rules.map(rule => `- ${rule.rule}`).join('\n')}`);
  if (focus !== 'power' && options.power)
    blocks.push(`Ladder on the author's screen:\n${options.power.rungs.map(rung => `- ${rung.name}: ${rung.buys} (costs ${rung.cost})`).join('\n')}`);
  return blocks.length > 0 ? `${blocks.join('\n\n')}\n\nThese parts are not yours to change this round; make what you write fit them.` : null;
}

export const enginePass: PassStep<BlueprintEngineOutput, EngineOptions, never> = {
  kind: 'pass',
  key: ENGINE_STEP_KEY,
  phase: 'core',
  nudges: [],
  prompt: blueprintEnginePrompt,
  optionsSchema: EngineOptions,
  budgetTokens: ENGINE_BUDGET_TOKENS,

  inputs(context: StepInputContext<EngineOptions>): Promise<BlueprintInputSection[]> {
    const focus = ENGINE_SLICES.find(slice => slice === context.focus) ?? null;
    const applicable = ENGINE_SLICES.filter(slice => engineSliceApplies(slice, context.ledger));
    const asked = focus ? [focus] : applicable;
    const leads = context.previous?.protagonist?.leads.length ?? 1;
    const sections: BlueprintInputSection[] = [{ key: 'engine_scope', content: renderScope(asked, applicable.includes('power'), leads), required: true }];
    const kept = focus && context.previous ? renderKept(context.previous, focus) : null;
    if (kept) sections.push({ key: 'engine_so_far', content: kept });
    return Promise.resolve(sections);
  },

  toRound(output, { previous, focus }) {
    const options = mergeEngineSlices(previous, freshSlices(output), focus);
    if (Object.keys(options).length === 0) throw AppErrorCode.AI_001.create();
    return { options, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    const protagonist = (options.protagonist?.versions ?? []).map((version): StepOption => ({ id: version.id, label: version.lie }));
    const opposition = (options.opposition?.forms ?? []).map((form): StepOption => ({ id: form.id, label: `${form.label}: ${form.summary}` }));
    const cost = (options.world?.costRules ?? []).map((rule): StepOption => ({ id: rule.id, label: rule.rule }));
    const rules = (options.world?.rules ?? []).map((rule): StepOption => ({ id: rule.id, label: rule.rule }));
    const rungs = (options.power?.rungs ?? []).map((rung): StepOption => ({ id: rung.id, label: `${rung.name} — ${rung.buys}` }));
    return [...protagonist, ...opposition, ...cost, ...rules, ...rungs];
  },
};
