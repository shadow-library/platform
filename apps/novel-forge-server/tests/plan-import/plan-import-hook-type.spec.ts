import { describe, expect, it } from 'bun:test';
import { ClassSchema } from '@shadow-library/class-schema';

import { HOOK_TYPES } from '@modules/ai/schemas/enums';
import { parseSchema } from '@modules/ai/schemas/validate';
import { PlanBundleBrief } from '@modules/plan-import/plan-import.dto';

function brief(hookType: string): Record<string, unknown> {
  return {
    chapter: 1,
    volumeKey: 'v1',
    title: 't',
    objective: 'o',
    events: ['e1'],
    endingContract: { hookType, emotionalBeat: 'b', openQuestion: 'q', handoffState: 's' },
  };
}

describe('plan-import endingContract.hookType', () => {
  it('should accept every hook type the server enum declares', () => {
    for (const hookType of HOOK_TYPES) {
      expect(parseSchema(PlanBundleBrief, brief(hookType)).success).toBe(true);
    }
  });

  it('should reject a hook type outside the enum, citing the field', () => {
    const result = parseSchema(PlanBundleBrief, brief('happily_ever_after'));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.some(i => i.path.join('.') === 'endingContract.hookType')).toBe(true);
  });

  it('should expose the enum values as the bundle schema is the only hook-type authority', () => {
    const { definitions } = ClassSchema.generate(PlanBundleBrief);
    const hookTypeDef = Object.values(definitions ?? {}).find(d => d.$id?.includes('HookType'));
    expect(hookTypeDef?.enum).toEqual([...HOOK_TYPES]);
  });
});
