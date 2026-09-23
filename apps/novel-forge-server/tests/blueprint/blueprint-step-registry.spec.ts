import { describe, expect, it } from 'bun:test';

import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { blueprintStep, BlueprintStepRegistry, validateBlueprintSteps } from '@modules/blueprint/engine/blueprint-step.registry';
import { BLUEPRINT_STEPS } from '@modules/blueprint/steps/blueprint-steps';
import { startStep } from '@modules/blueprint/steps/start.step';

import { engineCoreScreen, enginePass, engineWorldScreen } from './blueprint-fixtures';

const ENGINE = [blueprintStep(enginePass), blueprintStep(engineCoreScreen), blueprintStep(engineWorldScreen)];

describe('validateBlueprintSteps', () => {
  it('should accept the registered steps', () => {
    expect(validateBlueprintSteps(BLUEPRINT_STEPS, PROMPT_REGISTRY)).toEqual([]);
  });

  it('should flag a step registered twice', () => {
    expect(validateBlueprintSteps([blueprintStep(startStep), blueprintStep(startStep)], PROMPT_REGISTRY)).toEqual(['step "start" is registered twice']);
  });

  it('should flag a malformed key and an unknown phase', () => {
    const issues = validateBlueprintSteps([blueprintStep({ ...startStep, key: 'Start Here', phase: 'epilogue' as never })], PROMPT_REGISTRY);
    expect(issues.some(issue => issue.includes('not lowercase words'))).toBe(true);
    expect(issues.some(issue => issue.includes('unknown phase "epilogue"'))).toBe(true);
  });

  it('should refuse a step keyed "gate", which the mode switch already owns as a topic and a lock', () => {
    expect(validateBlueprintSteps([blueprintStep({ ...startStep, key: 'gate' })], PROMPT_REGISTRY)).toEqual(['step "gate" takes a key the Blueprint reserves']);
  });

  it('should flag a prompt missing from the prompt registry', () => {
    const unregistered = { ...startStep.prompt, version: '9.9.9' };
    expect(validateBlueprintSteps([blueprintStep({ ...startStep, prompt: unregistered })], PROMPT_REGISTRY)).toEqual([
      'step "start" uses prompt "blueprint-start", which PROMPT_REGISTRY does not hold',
    ]);
  });

  it('should flag a prompt that does not route through a Blueprint role', () => {
    const prompt = { ...startStep.prompt, role: 'chat' as const };
    const issues = validateBlueprintSteps([blueprintStep({ ...startStep, prompt })], { 'blueprint-start': prompt as never });
    expect(issues).toEqual(['step "start" routes as "chat", not a Blueprint role']);
  });

  it('should flag a completion topic that is not a ledger topic key', () => {
    expect(validateBlueprintSteps([blueprintStep({ ...startStep, completionTopics: ['Start!'] })], PROMPT_REGISTRY)).toEqual([
      'step "start" writes topic "Start!", which is not a ledger topic key',
    ]);
  });
});

describe('validateBlueprintSteps completion', () => {
  it('should flag a required step with no completion topic, which would count as done from the start', () => {
    expect(validateBlueprintSteps([blueprintStep({ ...startStep, required: true, completionTopics: [] })], PROMPT_REGISTRY)).toEqual([
      'required step "start" names no completion topic',
    ]);
  });
});

describe('validateBlueprintSteps with a pass', () => {
  it('should accept a pass feeding its screens', () => {
    expect(validateBlueprintSteps(ENGINE, PROMPT_REGISTRY)).toEqual([]);
  });

  it('should flag a pass that feeds nothing and a screen sourced from something that is not a pass', () => {
    const orphan = blueprintStep({ ...engineWorldScreen, source: { ...engineWorldScreen.source, step: 'start' } });
    expect(validateBlueprintSteps([blueprintStep(startStep), blueprintStep(enginePass), orphan], PROMPT_REGISTRY)).toEqual([
      'pass "engine" feeds no screen',
      'step "engine_world" is sourced from "start", which is not a registered pass',
    ]);
  });
});

describe('BlueprintStepRegistry', () => {
  it('should run a sourced screen’s rounds on its pass and refuse to lock the pass', () => {
    const registry = new BlueprintStepRegistry([blueprintStep(startStep), ...ENGINE]);
    expect(registry.roundTarget('engine_world')).toMatchObject({ generator: { key: 'engine' }, focus: 'engine_world' });
    expect(registry.roundTarget('start')).toMatchObject({ generator: { key: 'start' }, focus: null });
    expect(() => registry.lockable('engine')).toThrow(expect.objectContaining({ code: 'BPR_007' }));
  });

  it('should find a registered step and refuse an unknown one', () => {
    const registry = new BlueprintStepRegistry(BLUEPRINT_STEPS);
    expect(registry.get('start').phase).toBe('idea');
    expect(registry.find('nowhere_step')).toBeUndefined();
    expect(() => registry.get('nowhere_step')).toThrow(expect.objectContaining({ code: 'BPR_001' }));
  });
});
