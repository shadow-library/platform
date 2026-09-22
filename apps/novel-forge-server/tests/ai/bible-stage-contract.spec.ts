import { describe, expect, it } from 'bun:test';

import { renderStageContract, validateStageCoverage } from '@modules/ai/prompts/bible-builder/stage-contract';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type BibleStageOutput } from '@modules/ai/schemas';
import { chapterForStage } from '@modules/bible/bible-manifest';

function stageOutput(entities: BibleStageOutput['entities']): BibleStageOutput {
  return { body: 'Stage prose.', entities } as BibleStageOutput;
}

function entity(entityKey: string, type: string): NonNullable<BibleStageOutput['entities']>[number] {
  return { entityKey, name: entityKey, type } as NonNullable<BibleStageOutput['entities']>[number];
}

describe('renderStageContract', () => {
  it('should mandate records for a stage whose manifest chapter declares entity types', () => {
    const contract = renderStageContract('power');
    expect(contract).toContain('MANDATORY — emit `entities`');
    expect(contract).toContain('at least 4 entities of type power_rule / concept');
    expect(contract).toContain('progression ladder');
  });

  it('should ask only for topics on a stage that materializes nothing', () => {
    const contract = renderStageContract('volumes');
    expect(contract).not.toContain('MANDATORY');
    expect(contract).toContain('volume objectives');
  });
});

describe('validateStageCoverage', () => {
  it('should reject a stage that returns prose and no records', () => {
    const errors = validateStageCoverage('characters', stageOutput([]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('project/cast must materialize at least 3 entities of type character — received 0');
  });

  it('should reject an omitted entities field exactly as it rejects an empty one', () => {
    expect(validateStageCoverage('characters', stageOutput(undefined))).toHaveLength(1);
  });

  it('should accept a stage that meets its floor', () => {
    const entities = [entity('kael', 'character'), entity('mira', 'character'), entity('dane', 'character')];
    expect(validateStageCoverage('characters', stageOutput(entities))).toEqual([]);
  });

  it('should not count off-type records toward the floor', () => {
    const entities = [entity('kael', 'character'), entity('the_choir', 'faction'), entity('spire', 'location')];
    const errors = validateStageCoverage('characters', stageOutput(entities));
    expect(errors[0]).toContain('received 1');
  });

  it('should allow extra records of other types alongside a satisfied floor', () => {
    const entities = [entity('a', 'character'), entity('b', 'character'), entity('c', 'character'), entity('d', 'faction')];
    expect(validateStageCoverage('characters', stageOutput(entities))).toEqual([]);
  });

  it('should stay silent for a stage that materializes nothing', () => {
    expect(validateStageCoverage('volumes', stageOutput([]))).toEqual([]);
    expect(validateStageCoverage('plot', stageOutput([]))).toEqual([]);
  });
});

describe('bible-builder prompt modules', () => {
  it('should guard every entity-bearing stage with a postValidate the repair ladder can act on', () => {
    const entries: [string, ReturnType<typeof chapterForStage>][] = [
      ['bible:world', chapterForStage('world')],
      ['bible:power', chapterForStage('power')],
      ['bible:factions-locations', chapterForStage('factionsAndLocations')],
      ['bible:characters', chapterForStage('characters')],
    ];
    for (const [key, chapter] of entries) {
      expect(chapter.materializes.length).toBeGreaterThan(0);
      const prompt = PROMPT_REGISTRY[key as 'bible:power'];
      expect(prompt.postValidate).toBeDefined();
      expect(prompt.postValidate?.({ body: 'prose only' } as never)).toHaveLength(1);
    }
  });

  it('should render the worldFacts instruction with real backticks rather than escaped ones', () => {
    expect(PROMPT_REGISTRY['bible:power'].system).toContain('emit `worldFacts` entries');
    expect(PROMPT_REGISTRY['bible:power'].system).not.toContain('\\`worldFacts');
  });
});
