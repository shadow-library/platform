import { describe, expect, it } from 'bun:test';

import { type PlanBundle, type PlanBundleArc, type PlanBundleBrief, type PlanBundleVolume } from '@modules/plan-import/plan-import.dto';
import { validatePlanBundle } from '@modules/plan-import/plan-import.validator';

const NO_ENTITIES: ReadonlySet<string> = new Set();

function volume(volumeKey: string, ordinal: number, targetChapterCount: number): PlanBundleVolume {
  return { volumeKey, ordinal, targetChapterCount, title: 't', objective: 'o', conflict: 'c', payoff: 'p' } as PlanBundleVolume;
}

function arc(arcKey: string, volumeKey: string, ordinal: number, chapterStart: number, chapterEnd: number): PlanBundleArc {
  return { arcKey, volumeKey, ordinal, chapterStart, chapterEnd, title: 't', objective: 'o', escalation: 'e', payoff: 'p', hook: 'h' } as PlanBundleArc;
}

function brief(chapter: number, volumeKey: string, arcKey?: string): PlanBundleBrief {
  return {
    chapter,
    volumeKey,
    arcKey,
    title: 't',
    objective: 'o',
    events: ['e1'],
    endingContract: { hookType: 'cliffhanger', emotionalBeat: 'b', openQuestion: 'q', handoffState: 's' },
  } as PlanBundleBrief;
}

function bundle(parts: Partial<PlanBundle>): PlanBundle {
  return { format: 'novel-forge-plan', version: 1, ...parts } as PlanBundle;
}

describe('validatePlanBundle', () => {
  it('should accept a full coherent bundle and compute cumulative volume ranges', () => {
    const result = validatePlanBundle(
      bundle({
        volumes: [volume('v1', 1, 4), volume('v2', 2, 3)],
        arcs: [arc('a1', 'v1', 1, 1, 2), arc('a2', 'v1', 2, 3, 4)],
        briefs: [brief(1, 'v1', 'a1'), brief(3, 'v1', 'a2'), brief(5, 'v2')],
      }),
      NO_ENTITIES,
    );

    expect(result.issues).toEqual([]);
    expect(result.volumeRanges.get('v1')).toEqual({ start: 1, end: 4 });
    expect(result.volumeRanges.get('v2')).toEqual({ start: 5, end: 7 });
    expect(result.arcVolumeKeys).toEqual(['v1']);
  });

  it('should compute ranges in ordinal order regardless of array order', () => {
    const result = validatePlanBundle(bundle({ volumes: [volume('v2', 2, 3), volume('v1', 1, 4)] }), NO_ENTITIES);
    expect(result.volumeRanges.get('v1')).toEqual({ start: 1, end: 4 });
    expect(result.volumeRanges.get('v2')).toEqual({ start: 5, end: 7 });
  });

  it('should flag duplicate natural keys and ordinals', () => {
    const result = validatePlanBundle(
      bundle({
        bible: [
          { section: 'project', slug: 'premise', body: 'x' },
          { section: 'project', slug: 'premise', body: 'y' },
        ],
        entities: [
          { entityKey: 'hero', type: 'character', name: 'Hero' },
          { entityKey: 'hero', type: 'character', name: 'Hero 2' },
        ],
        volumes: [volume('v1', 1, 4), volume('v1', 1, 3)],
        arcs: [arc('a1', 'v1', 1, 1, 2), arc('a1', 'v1', 2, 3, 4)],
        briefs: [brief(1, 'v1', 'a1'), brief(1, 'v1', 'a1')],
      } as Partial<PlanBundle>),
      NO_ENTITIES,
    );

    const messages = result.issues.map(i => i.msg);
    expect(messages).toContain("duplicate document 'project/premise'");
    expect(messages).toContain("duplicate entityKey 'hero'");
    expect(messages).toContain("duplicate volumeKey 'v1'");
    expect(messages).toContain("duplicate arcKey 'a1'");
    expect(messages).toContain('duplicate chapter 1');
    expect(messages).toContain('duplicate ordinal 1');
  });

  it('should reject arcs referencing a volume missing from the bundle', () => {
    const result = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4)], arcs: [arc('a1', 'v9', 1, 1, 4)] }), NO_ENTITIES);
    expect(result.issues.some(i => i.msg.includes("unknown volume 'v9'"))).toBe(true);
  });

  it('should reject arc gaps, inverted ranges, and incomplete coverage', () => {
    const gap = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 10)], arcs: [arc('a1', 'v1', 1, 1, 4), arc('a2', 'v1', 2, 6, 10)] }), NO_ENTITIES);
    expect(gap.issues.some(i => i.msg.includes('starts at chapter 6, expected 5'))).toBe(true);

    const inverted = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 10)], arcs: [arc('a1', 'v1', 1, 1, 0)] }), NO_ENTITIES);
    expect(inverted.issues.some(i => i.msg.includes('chapterEnd before chapterStart'))).toBe(true);

    const short = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 10)], arcs: [arc('a1', 'v1', 1, 1, 8)] }), NO_ENTITIES);
    expect(short.issues.some(i => i.msg.includes('end at chapter 8, expected 10'))).toBe(true);
  });

  it('should allow arc-less volumes alongside arc-bearing ones', () => {
    const result = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4), volume('v2', 2, 3)], arcs: [arc('a1', 'v1', 1, 1, 4)] }), NO_ENTITIES);
    expect(result.issues).toEqual([]);
    expect(result.arcVolumeKeys).toEqual(['v1']);
  });

  it('should reject briefs outside every volume, with a wrong volumeKey, or with wrong arc claims', () => {
    const outside = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4)], briefs: [brief(9, 'v1')] }), NO_ENTITIES);
    expect(outside.issues.some(i => i.msg.includes('no bundle volume covers chapter 9'))).toBe(true);

    const wrongVolume = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4), volume('v2', 2, 3)], briefs: [brief(5, 'v1')] }), NO_ENTITIES);
    expect(wrongVolume.issues.some(i => i.msg.includes("lies in volume 'v2' but the brief claims 'v1'"))).toBe(true);

    const missingArc = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4)], arcs: [arc('a1', 'v1', 1, 1, 4)], briefs: [brief(2, 'v1')] }), NO_ENTITIES);
    expect(missingArc.issues.some(i => i.msg.includes("lies in arc 'a1' but the brief claims 'none'"))).toBe(true);

    const strayArc = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4)], briefs: [brief(2, 'v1', 'a9')] }), NO_ENTITIES);
    expect(strayArc.issues.some(i => i.msg.includes("unknown arc 'a9'"))).toBe(true);
  });

  it('should warn on dangling entity refs but respect existing project entities', () => {
    const withCast = { ...volume('v1', 1, 4), cast: ['hero', 'ghost'] };
    const withRefs = { ...brief(1, 'v1'), requiredContext: ['entity:hero', 'entity:ghost', 'volume:v1', 'thread:open_mystery', 'plain'] };
    const result = validatePlanBundle(bundle({ volumes: [withCast], briefs: [withRefs] }), new Set(['hero']));

    expect(result.issues).toEqual([]);
    expect(result.warnings).toContain("volume 'v1' casts unknown entity 'ghost'");
    expect(result.warnings).toContain("brief 1 requiredContext references unknown entity 'ghost'");
    expect(result.warnings).toContain("brief 1 requiredContext 'thread:open_mystery' — only entity:/volume: refs resolve before generation");
    expect(result.warnings).toContain("brief 1 requiredContext 'plain' — only entity:/volume: refs resolve before generation");
    expect(result.warnings.some(w => w.includes("'hero'"))).toBe(false);
  });
});

describe('validatePlanBundle — knowledge contracts (bundle v2)', () => {
  function fact(factKey: string, subjects?: string[]): { factKey: string; text: string; subjects?: string[] } {
    return { factKey, text: 'the truth', subjects };
  }

  it('should reject duplicate fact keys and reveals of unknown facts', () => {
    const withContract = { ...brief(1, 'v1'), knowledgeContract: { pov: ['hero'], learns: [{ entityKey: 'hero', factKey: 'ghost_fact' }] } };
    const result = validatePlanBundle(bundle({ volumes: [volume('v1', 1, 4)], facts: [fact('secret'), fact('secret')] as never, briefs: [withContract] }), new Set(['hero']));
    expect(result.issues).toContainEqual({ field: 'facts', msg: "duplicate factKey 'secret'" });
    expect(result.issues).toContainEqual({ field: 'briefs[0].knowledgeContract', msg: "chapter 1 reveals unknown fact 'ghost_fact' — reveals must name a bundle or project fact" });
  });

  it('should accept reveals of existing project facts and warn on unknown entities and unrevealed facts', () => {
    const withContract = { ...brief(1, 'v1'), knowledgeContract: { pov: ['hero', 'stranger'], learns: [{ entityKey: 'nobody', factKey: 'old_secret' }] } };
    const result = validatePlanBundle(
      bundle({ volumes: [volume('v1', 1, 4)], facts: [fact('fresh_secret', ['phantom'])] as never, briefs: [withContract] }),
      new Set(['hero']),
      new Set(['old_secret']),
    );
    expect(result.issues).toEqual([]);
    expect(result.warnings).toContain("brief 1 knowledgeContract.pov names unknown entity 'stranger'");
    expect(result.warnings).toContain("brief 1 knowledgeContract reveals to unknown entity 'nobody'");
    expect(result.warnings).toContain("fact 'fresh_secret' subjects unknown entity 'phantom'");
    expect(result.warnings).toContain("fact 'fresh_secret' is never revealed by any brief in this bundle — it stays hidden until a later plan or a manual reveal");
    expect(result.warnings.some(w => w.includes("'hero'"))).toBe(false);
  });
});
