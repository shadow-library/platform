import { describe, expect, it } from 'bun:test';

import {
  blueprintAltitude,
  blueprintComplete,
  blueprintEntry,
  findPhaseOfStep,
  groupPhasesByAltitude,
  keepRefiningStep,
  phasePosition,
} from '../src/features/blueprint/blueprint-phases';
import { blueprintStepMeta } from '../src/features/blueprint/blueprint-steps';
import { type BlueprintPhase, type BlueprintPhaseProgressResponse, type BlueprintPhaseStatus, type BlueprintStepProgressResponse } from '../src/lib/apis';

const LABELS: Record<BlueprintPhase, string> = {
  idea: 'Idea',
  heart: 'Heart',
  core: 'Core',
  world: 'World',
  spine: 'Spine',
  volume_one: 'Volume one',
  opening: 'Opening',
};

function step(key: string, overrides: Partial<BlueprintStepProgressResponse> = {}): BlueprintStepProgressResponse {
  return { key, required: true, applies: true, done: false, ...overrides };
}

function phase(name: BlueprintPhase, status: BlueprintPhaseStatus, steps: BlueprintStepProgressResponse[] = [], lockReason?: string): BlueprintPhaseProgressResponse {
  return { phase: name, label: LABELS[name], status, steps, ...(lockReason ? { lockReason } : {}) };
}

const EVERY_PHASE: BlueprintPhase[] = ['idea', 'heart', 'core', 'world', 'spine', 'volume_one', 'opening'];

describe('groupPhasesByAltitude', () => {
  it('should cut the seven phases into the four altitudes in order', () => {
    const groups = groupPhasesByAltitude(EVERY_PHASE.map(name => phase(name, 'locked')));

    expect(groups.map(group => group.altitude)).toEqual(['The novel', 'The engine', 'The shape', 'Up close']);
    expect(groups.map(group => group.phases.map(entry => entry.phase))).toEqual([['idea', 'heart'], ['core', 'world'], ['spine'], ['volume_one', 'opening']]);
  });

  it('should return no groups for no phases', () => {
    expect(groupPhasesByAltitude([])).toEqual([]);
  });

  it('should place every phase at exactly one altitude', () => {
    expect(EVERY_PHASE.map(blueprintAltitude)).toEqual(['The novel', 'The novel', 'The engine', 'The engine', 'The shape', 'Up close', 'Up close']);
  });
});

describe('blueprintEntry', () => {
  it('should send the author to the current phase’s first unfinished applicable step', () => {
    const phases = [phase('idea', 'done', [step('start', { done: true })]), phase('heart', 'current', [step('theme', { done: true }), step('promise')])];

    expect(blueprintEntry(phases)).toEqual({ kind: 'step', step: 'promise' });
  });

  it('should skip a step the reader promise rules out', () => {
    const phases = [phase('world', 'current', [step('power', { applies: false }), step('rules')])];

    expect(blueprintEntry(phases)).toEqual({ kind: 'step', step: 'rules' });
  });

  it('should never send the author into a locked phase', () => {
    const phases = [phase('idea', 'done', [step('start', { done: true })]), phase('heart', 'locked', [step('theme')], 'Opens when the premise is locked')];

    expect(blueprintEntry(phases)).toEqual({ kind: 'unreachable' });
  });

  it('should fall back to an unfinished step outside the current phase', () => {
    const phases = [phase('idea', 'open', [step('start')]), phase('heart', 'open', [step('theme', { done: true })])];

    expect(blueprintEntry(phases)).toEqual({ kind: 'step', step: 'start' });
  });

  it('should send the author to the gate once every required applicable step is done', () => {
    const phases = [phase('idea', 'done', [step('premise', { done: true })]), phase('heart', 'done', [step('theme', { done: true })])];

    expect(blueprintEntry(phases)).toEqual({ kind: 'gate' });
  });

  it('should let the gate win over an optional step the author skipped', () => {
    const phases = [phase('idea', 'done', [step('taste', { required: false }), step('premise', { done: true })])];

    expect(blueprintComplete(phases)).toBe(true);
    expect(blueprintEntry(phases)).toEqual({ kind: 'gate' });
  });

  it('should not call a Blueprint complete while a required step it needs is open', () => {
    const phases = [phase('idea', 'done', [step('premise', { done: true })]), phase('world', 'current', [step('rules'), step('power', { applies: false })])];

    expect(blueprintComplete(phases)).toBe(false);
    expect(blueprintEntry(phases)).toEqual({ kind: 'step', step: 'rules' });
  });

  it('should ignore a required step the novel does not need when deciding it is complete', () => {
    const phases = [phase('world', 'done', [step('rules', { done: true }), step('power', { applies: false })])];

    expect(blueprintComplete(phases)).toBe(true);
  });

  it('should report a Blueprint with no steps at all as unreachable rather than complete-by-vacuum', () => {
    const phases = EVERY_PHASE.map(name => phase(name, 'open'));

    expect(blueprintComplete(phases)).toBe(false);
    expect(blueprintEntry(phases)).toEqual({ kind: 'unreachable' });
  });

  it('should not carry the Blueprint to the gate on a phase that has nothing required to settle', () => {
    const phases = [phase('idea', 'done', [step('premise', { done: true })]), phase('opening', 'open', [step('voice', { required: false, done: true })])];

    expect(blueprintComplete(phases)).toBe(false);
  });
});

describe('keepRefiningStep', () => {
  it('should send "Keep refining" to the optional step the author skipped', () => {
    const phases = [phase('idea', 'done', [step('taste', { required: false }), step('premise', { done: true })]), phase('heart', 'done', [step('theme', { done: true })])];

    expect(keepRefiningStep(phases)).toBe('taste');
  });

  it('should fall back to the last step the author could have locked, which is where they just were', () => {
    const phases = [phase('idea', 'done', [step('premise', { done: true })]), phase('opening', 'done', [step('briefs', { done: true }), step('check', { done: true })])];

    expect(keepRefiningStep(phases)).toBe('check');
  });

  it('should skip a step the novel does not need when falling back', () => {
    expect(keepRefiningStep([phase('world', 'done', [step('rules', { done: true }), step('power', { applies: false })])])).toBe('rules');
  });

  it('should answer null when no phase offers a step, so the button can hide rather than do nothing', () => {
    expect(keepRefiningStep([phase('idea', 'open')])).toBeNull();
  });
});

describe('findPhaseOfStep and phasePosition', () => {
  it('should find the phase a step belongs to, applicable or not', () => {
    const phases = [phase('idea', 'current', [step('start')]), phase('world', 'locked', [step('power', { applies: false })])];

    expect(findPhaseOfStep(phases, 'power')?.phase).toBe('world');
    expect(findPhaseOfStep(phases, 'nothing-like-it')).toBeNull();
  });

  it('should number phases from one for the "Phase N of 7" header', () => {
    const phases = EVERY_PHASE.map(name => phase(name, 'locked'));

    expect(phasePosition(phases, 'idea')).toBe(1);
    expect(phasePosition(phases, 'opening')).toBe(7);
  });
});

describe('blueprintStepMeta', () => {
  it('should carry the copy for a step whose screen exists', () => {
    expect(blueprintStepMeta('start').label).toBe('Starting point');
  });

  it('should name a step whose screen does not exist yet instead of throwing', () => {
    expect(blueprintStepMeta('volume_one.cast').label).toBe('Volume one cast');
  });
});
