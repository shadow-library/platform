import { describe, expect, it } from 'bun:test';

import { renderStageContract } from '@modules/ai/prompts/bible-builder/stage-contract';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';

const STAGE_PROMPT_KEYS = ['bible:foundation', 'bible:world', 'bible:power', 'bible:factions-locations', 'bible:characters', 'bible:plot', 'bible:volumes'] as const;

describe('renderStageContract', () => {
  it('should ask for records of every kind the material establishes, with no minimum', () => {
    const contract = renderStageContract('power');
    expect(contract).toContain('Emit `entities` for every power_rule / concept the material establishes');
    expect(contract).toContain('There is no minimum');
    expect(contract).not.toMatch(/at least \d/);
  });

  it('should offer topics as guidance to leave out rather than invent', () => {
    const contract = renderStageContract('power');
    expect(contract).toContain('Cover these where the material supports them: progression ladder');
    expect(contract).toContain('Leave a topic out rather than invent it.');
    expect(contract).not.toContain('audit checks');
  });

  it('should ask only for topics on a stage that materializes nothing', () => {
    const contract = renderStageContract('volumes');
    expect(contract).not.toContain('`entities`');
    expect(contract).toContain('volume objectives');
  });
});

describe('bible-builder prompt modules', () => {
  it('should never reject and retry a stage for the number of records it returned', () => {
    for (const key of STAGE_PROMPT_KEYS) expect(PROMPT_REGISTRY[key].postValidate).toBeUndefined();
  });

  it('should forbid every stage from inventing content to fill the section', () => {
    for (const key of STAGE_PROMPT_KEYS) expect(PROMPT_REGISTRY[key].system).toContain('never add a character, faction, place, rule or event to fill out the section');
  });

  it('should keep the escalation map to the opening conflict unless the author gave more', () => {
    const plot = PROMPT_REGISTRY['bible:plot'];
    expect(plot.version).toBe('3.0.0');
    expect(plot.system).toContain('Describe the opening conflict');
    expect(plot.system).toContain('Never invent an endgame, a climactic confrontation or later volumes the author has not given');
    expect(plot.system).not.toContain('state that endgame plainly');
  });

  it('should plan only the volumes the author has named', () => {
    const volumes = PROMPT_REGISTRY['bible:volumes'];
    expect(volumes.version).toBe('3.0.0');
    expect(volumes.system).toContain('Add a later volume only when the project brief or the escalation map names it');
  });

  it('should render the worldFacts instruction with real backticks rather than escaped ones', () => {
    expect(PROMPT_REGISTRY['bible:power'].system).toContain('emit `worldFacts` entries');
    expect(PROMPT_REGISTRY['bible:power'].system).not.toContain('\\`worldFacts');
  });
});
