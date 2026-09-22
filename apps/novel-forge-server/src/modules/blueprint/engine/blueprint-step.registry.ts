import { AppErrorCode } from '@server/classes';

import { type PromptKey, type PromptModule } from '../../ai/prompts/types';
import { BLUEPRINT_PHASES } from '../blueprint-phase';
import { TOPIC_KEY_PATTERN } from '../ledger/ledger.types';
import {
  type AnyBlueprintStep,
  type AnyGeneratingStep,
  type AnyLockingStep,
  BLUEPRINT_ROLES,
  isGenerating,
  isLocking,
  isSourced,
  type PassStep,
  type ScreenStep,
  type SourcedScreenStep,
} from './blueprint-step.types';

export const STEP_KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;

export interface RoundTarget {
  generator: AnyGeneratingStep;
  /** The sourced screen the round was asked for, when it runs on that screen's pass. */
  focus: string | null;
}

export function blueprintStep<TOutput, TOptions, TInput, TSelection>(step: ScreenStep<TOutput, TOptions, TInput, TSelection>): AnyBlueprintStep;
export function blueprintStep<TOutput, TOptions, TInput>(step: PassStep<TOutput, TOptions, TInput>): AnyBlueprintStep;
export function blueprintStep<TPassOptions, TView, TSelection>(step: SourcedScreenStep<TPassOptions, TView, TSelection>): AnyBlueprintStep;
export function blueprintStep(step: object): AnyBlueprintStep {
  return step as AnyBlueprintStep;
}

export function steerTopic(step: Pick<AnyBlueprintStep, 'key'>): string {
  return `${step.key}.steer`;
}

export function rejectedTopic(step: Pick<AnyBlueprintStep, 'key'>): string {
  return `${step.key}.rejected`;
}

function generatorIssues(step: AnyGeneratingStep, prompts: Partial<Record<PromptKey, PromptModule<unknown>>>): string[] {
  const issues: string[] = [];
  if (prompts[step.prompt.key] !== (step.prompt as PromptModule<unknown>)) issues.push(`step "${step.key}" uses prompt "${step.prompt.key}", which PROMPT_REGISTRY does not hold`);
  if (!(BLUEPRINT_ROLES as readonly string[]).includes(step.prompt.role ?? '')) issues.push(`step "${step.key}" routes as "${step.prompt.role}", not a Blueprint role`);
  return issues;
}

function sourceIssues(step: AnyBlueprintStep, byKey: Map<string, AnyBlueprintStep>): string[] {
  if (!isSourced(step)) return [];
  const pass = byKey.get(step.source.step);
  return pass?.kind === 'pass' ? [] : [`step "${step.key}" is sourced from "${step.source.step}", which is not a registered pass`];
}

export function validateBlueprintSteps(steps: readonly AnyBlueprintStep[], prompts: Partial<Record<PromptKey, PromptModule<unknown>>>): string[] {
  const issues: string[] = [];
  const byKey = new Map<string, AnyBlueprintStep>();
  for (const step of steps) {
    if (byKey.has(step.key)) issues.push(`step "${step.key}" is registered twice`);
    byKey.set(step.key, step);
  }

  for (const step of steps) {
    if (!STEP_KEY_PATTERN.test(step.key)) issues.push(`step "${step.key}" has a key that is not lowercase words joined by underscores`);
    if (!BLUEPRINT_PHASES.includes(step.phase)) issues.push(`step "${step.key}" names an unknown phase "${step.phase}"`);
    if (isGenerating(step)) issues.push(...generatorIssues(step, prompts));
    issues.push(...sourceIssues(step, byKey));
    if (step.kind === 'pass' && !steps.some(screen => isSourced(screen) && screen.source.step === step.key)) issues.push(`pass "${step.key}" feeds no screen`);
    const topics = [steerTopic(step), rejectedTopic(step), ...(isLocking(step) ? step.completionTopics : [])];
    for (const topic of topics) {
      if (!TOPIC_KEY_PATTERN.test(topic)) issues.push(`step "${step.key}" writes topic "${topic}", which is not a ledger topic key`);
    }
  }
  return issues;
}

export class BlueprintStepRegistry {
  private readonly steps: ReadonlyMap<string, AnyBlueprintStep>;

  constructor(readonly all: readonly AnyBlueprintStep[]) {
    this.steps = new Map(all.map(step => [step.key, step]));
  }

  find(key: string): AnyBlueprintStep | undefined {
    return this.steps.get(key);
  }

  get(key: string): AnyBlueprintStep {
    const step = this.steps.get(key);
    if (!step) throw AppErrorCode.BPR_001.create({ step: key });
    return step;
  }

  /** Where a round asked for on `key` runs: the step itself, or the pass a sourced screen draws from. */
  roundTarget(key: string): RoundTarget {
    const step = this.get(key);
    if (!isSourced(step)) return { generator: step, focus: null };
    return { generator: this.get(step.source.step) as AnyGeneratingStep, focus: step.key };
  }

  lockable(key: string): AnyLockingStep {
    const step = this.get(key);
    if (!isLocking(step)) throw AppErrorCode.BPR_007.create({ step: key });
    return step;
  }
}
