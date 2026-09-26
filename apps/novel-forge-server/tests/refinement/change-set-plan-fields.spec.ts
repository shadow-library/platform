import { describe, expect, it } from 'bun:test';

import { changeSetRefs, renderOpVocabulary, validateChangeSet, validatePluginChangeSet } from '@modules/refinement';
import { validateBriefScenes, validateUnlockCondition } from '@server/common';

describe('validateChangeSet — chapter plan fields', () => {
  it('should accept every plan field on brief.update, and null wherever it clears one', () => {
    const planned = {
      op: 'brief.update',
      chapter: 4,
      direction: 'The keeper refuses the bargain.',
      contentMode: 'unrestricted',
      scenes: [{ summary: 'The tide rises.', pov: 'mira' }, { summary: 'The lamp gutters.' }],
      claimedMilestones: ['mira_rank_2'],
      isEnding: true,
    };
    const cleared = { op: 'brief.update', chapter: 4, direction: null, contentMode: null, scenes: null, claimedMilestones: null, isEnding: false };

    expect(validateChangeSet([planned, cleared])).toEqual([]);
  });

  it('should reject malformed plan fields', () => {
    const errors = validateChangeSet([
      { op: 'brief.update', chapter: 4, contentMode: 'explicit' },
      { op: 'brief.update', chapter: 4, isEnding: 'yes' },
      { op: 'brief.update', chapter: 4, scenes: [{ summary: ' ', pov: 'mira', mood: 'grim' }] },
      { op: 'brief.update', chapter: 4, claimedMilestones: ['mira_rank_2', ''] },
    ]);

    expect(errors).toEqual([
      'changeSet[0]: contentMode must be one of standard, unrestricted',
      "changeSet[1]: invalid field 'isEnding' (expected boolean)",
      "changeSet[2]: scenes[0] has unexpected field 'mood'",
      'changeSet[2]: scenes[0].summary must be a non-empty string',
      'changeSet[3]: claimedMilestones must hold non-empty milestone keys',
    ]);
  });

  it('should tolerate a state on volume.upsert without acting on it — the op cannot set a volume’s state', () => {
    expect(validateChangeSet([{ op: 'volume.upsert', volumeKey: 'volume_1', state: 'goal_met' }])).toEqual([]);
    expect(validateChangeSet([{ op: 'volume.upsert', volumeKey: 'volume_1', state: 'done' }])).toEqual([]);
  });

  it('should accept a fact unlock condition and clues, and null for either', () => {
    const unlock = { all: [{ milestone: 'mira_rank_2' }, { volume: 'volume_2' }, { chapter: 9 }, { ending: true }] };

    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', unlock, allowedClues: ['the lamp burns cold'] }])).toEqual([]);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', unlock: null, allowedClues: null }])).toEqual([]);
  });

  it('should reject a malformed unlock condition or clue list', () => {
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', unlock: { all: [{ chapter: 0 }] } }])).toEqual(['changeSet[0]: unlock.all[0].chapter must be an integer >= 1']);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', allowedClues: ['the lamp burns cold', '  '] }])).toEqual([
      'changeSet[0]: allowedClues must hold non-empty strings',
    ]);
    expect(validateChangeSet([{ op: 'fact.upsert', factKey: 'f1', allowedClues: 'the lamp burns cold' }])).toEqual([
      "changeSet[0]: invalid field 'allowedClues' (expected string[]|null)",
    ]);
  });

  it('should keep a plugin off a brief’s structure while letting it write the plan’s content', () => {
    const errors = validatePluginChangeSet([
      { op: 'brief.update', chapter: 4, direction: 'The keeper refuses.', scenes: [{ summary: 'The tide rises.' }] },
      { op: 'brief.update', chapter: 4, contentMode: 'unrestricted', claimedMilestones: ['mira_rank_2'], isEnding: true },
    ]);

    expect(errors).toEqual([
      "changeSet[1]: field 'contentMode' is not allowed for this scope",
      "changeSet[1]: field 'claimedMilestones' is not allowed for this scope",
      "changeSet[1]: field 'isEnding' is not allowed for this scope",
    ]);
  });

  it('should show the model the unlock shape and the plan fields', () => {
    const vocabulary = renderOpVocabulary(['brief.update', 'fact.upsert', 'volume.upsert']);

    expect(vocabulary).toContain('"unlock": <object|null, optional>');
    expect(vocabulary).toContain('{"ending": true}');
    expect(vocabulary).toContain('"isEnding": <boolean, optional>');
    expect(vocabulary).toContain('its state moves only through "goal met — start next"');
  });
});

describe('validateChangeSet — milestones', () => {
  it('should accept a milestone upsert and removal, and a subject cleared with null', () => {
    expect(
      validateChangeSet([
        { op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', label: 'Mira reaches the fourth rank', kind: 'rank', subjectEntityKey: 'mira' },
        { op: 'milestone.upsert', milestoneKey: 'tide_turns', subjectEntityKey: null },
        { op: 'milestone.remove', milestoneKey: 'old_rank' },
      ]),
    ).toEqual([]);
  });

  it('should reject an unknown kind, a blank label, a state the op may not set and a key with spaces', () => {
    expect(
      validateChangeSet([
        { op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', kind: 'level' },
        { op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', label: '  ' },
        { op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', state: 'reached' },
        { op: 'milestone.remove', milestoneKey: 'lamp rank 4' },
      ]),
    ).toEqual([
      'changeSet[0]: kind must be one of rank, event, learned_from, custom',
      'changeSet[1]: label must not be blank',
      "changeSet[2]: unexpected field 'state'",
      'changeSet[3]: milestoneKey must be a non-empty key without spaces',
    ]);
  });

  it('should keep milestones out of a plugin change-set and address them by key', () => {
    expect(validatePluginChangeSet([{ op: 'milestone.upsert', milestoneKey: 'lamp_rank_4', label: 'Fourth rank' }])).toEqual([
      "changeSet[0]: op 'milestone.upsert' is not allowed for this scope",
    ]);
    expect(changeSetRefs([{ op: 'milestone.remove', milestoneKey: 'lamp_rank_4' }])).toEqual(['milestone:lamp_rank_4']);
  });
});

describe('validateUnlockCondition', () => {
  it('should accept a conjunction of single-key terms', () => {
    expect(validateUnlockCondition({ all: [{ milestone: 'm1' }, { chapter: 3 }] })).toEqual([]);
  });

  it('should reject an empty conjunction, which would read as always unlocked', () => {
    expect(validateUnlockCondition({ all: [] })).toEqual(['unlock.all must be a non-empty array']);
  });

  it('should reject terms that are not exactly one known condition', () => {
    expect(validateUnlockCondition({ all: [{ milestone: 'm1', chapter: 3 }, { rank: 4 }, 'm1', { ending: false }, { volume: ' ' }] })).toEqual([
      'unlock.all[0] must have exactly one of milestone, volume, chapter, ending',
      'unlock.all[1] must have exactly one of milestone, volume, chapter, ending',
      'unlock.all[2] must be an object',
      'unlock.all[3].ending must be true',
      'unlock.all[4].volume must be a non-empty key',
    ]);
  });

  it('should reject anything but an object holding only all', () => {
    expect(validateUnlockCondition([])).toEqual(['unlock must be an object']);
    expect(validateUnlockCondition({ all: [{ chapter: 2 }], any: [] })).toEqual(["unlock has unexpected field 'any'"]);
  });
});

describe('validateBriefScenes', () => {
  it('should accept scenes with or without a point of view', () => {
    expect(validateBriefScenes([{ summary: 'a', pov: 'mira' }, { summary: 'b', pov: null }, { summary: 'c' }])).toEqual([]);
  });

  it('should reject a blank point of view', () => {
    expect(validateBriefScenes([{ summary: 'a', pov: '' }])).toEqual(['scenes[0].pov must be an entity key or null']);
  });
});
