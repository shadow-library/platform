import { Field, Schema } from '@shadow-library/class-schema';

import { type PassStep, type SourcedScreenStep, type StepOption } from '@modules/blueprint/engine/blueprint-step.types';
import { startStep } from '@modules/blueprint/steps/start.step';
import { type Blueprint, type Ledger } from '@server/database';

export function round(overrides: Partial<Blueprint.Round> = {}): Blueprint.Round {
  return {
    id: 11n,
    projectId: 7n,
    stepKey: 'start',
    round: 1,
    status: 'ready',
    jobId: 'job-1',
    steer: null,
    nudges: [],
    keepAsDirection: false,
    feedback: [],
    input: null,
    focus: null,
    options: { understood: [{ id: 'c1', label: 'A lighthouse keeper who hates the sea', kind: 'element' }] },
    coachMessage: null,
    error: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

export function ledgerEntry(overrides: Partial<Ledger.Entry> = {}): Ledger.Entry {
  return {
    id: 1n,
    projectId: 7n,
    kind: 'direction',
    phase: 'idea',
    topic: 'start',
    statement: 'A lighthouse keeper who hates the sea',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: 'start',
    payload: { kind: 'element' },
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    createdAt: new Date(0),
    ...overrides,
  };
}

export interface EngineOptions {
  core: { id: string; label: string }[];
  world: { id: string; label: string }[];
}

@Schema()
export class EngineSelection {
  @Field({ minLength: 1 })
  optionId: string;
}

@Schema()
class EngineOptionsSchema {
  @Field(() => [Object])
  core: object[];

  @Field(() => [Object])
  world: object[];
}

const describe = (items: { id: string; label: string }[]): StepOption[] => items.map(item => ({ id: item.id, label: item.label }));

export const enginePass: PassStep<EngineOptions, EngineOptions, unknown> = {
  kind: 'pass',
  key: 'engine',
  phase: 'core',
  nudges: [],
  prompt: startStep.prompt as never,
  optionsSchema: EngineOptionsSchema,
  toRound(output, context) {
    if (!context.previous || !context.focus) return { options: output, coachMessage: 'Both parts drafted.' };
    const part = context.focus === 'engine_world' ? 'world' : 'core';
    return { options: { ...context.previous, [part]: output[part] }, coachMessage: `Reworked ${part}.` };
  },
  describeOptions: options => describe([...options.core, ...options.world]),
};

function engineScreen(key: string, phase: 'core' | 'world', part: keyof EngineOptions): SourcedScreenStep<EngineOptions, { id: string; label: string }[], EngineSelection> {
  return {
    kind: 'screen',
    key,
    phase,
    nudges: ['Darker'],
    required: true,
    completionTopics: [part === 'core' ? 'protagonist' : 'world.rules'],
    selectionSchema: EngineSelection,
    source: { step: 'engine', select: options => options[part] },
    describeView: describe,
    chosenOptionIds: selection => [selection.optionId],
    materialise: async (selection, context) => {
      const chosen = context.round?.options.find(option => option.id === selection.optionId);
      return { entries: [{ kind: 'decision', topic: part === 'core' ? 'protagonist' : 'world.rules', statement: chosen?.label ?? '' }] };
    },
  };
}

export const engineCoreScreen = engineScreen('engine_core', 'core', 'core');
export const engineWorldScreen = engineScreen('engine_world', 'world', 'world');

export const engineOptions: EngineOptions = {
  core: [{ id: 'p1', label: 'A ferryman who lies to the dead' }],
  world: [{ id: 'w1', label: 'Every crossing costs a memory' }],
};
