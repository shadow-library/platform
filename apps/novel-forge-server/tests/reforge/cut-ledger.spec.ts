import { describe, expect, it } from 'bun:test';

import { buildBridgeDirectives, buildSeedCuts, type CutEntryLike, renderCutLedger, type SeedSpan, selectCutSlice, slugifyCutKey } from '@modules/reforge/cut-ledger';

function span(ordinal: number, from: number, to: number, action: SeedSpan['action'], targetChapters: number, extra: Partial<SeedSpan> = {}): SeedSpan {
  return { ordinal, fromChapter: from, toChapter: to, action, targetChapters, keptBeats: ['the duel lands'], ...extra };
}

const SPANS: SeedSpan[] = [
  span(1, 1, 4, 'keep', 4),
  span(2, 5, 12, 'condense', 3, { cutThreads: ['the tribunal subplot'], rationale: 'eight chapters of trial that resolve nothing' }),
  span(3, 13, 16, 'drop', 0, { arcLabel: 'The Ash Tournament', rationale: 'the tenth tournament in a row', cutThreads: ['the sword-scoring running gag'] }),
  span(4, 17, 20, 'keep', 4, { continuityNotes: 'six months have passed and the sect is dissolved' }),
];

function entry(cutKey: string, effectiveFromOutput: number, extra: Partial<CutEntryLike> = {}): CutEntryLike {
  return {
    cutKey,
    kind: 'thread',
    label: cutKey,
    aliases: [cutKey],
    detail: 'a thing that is gone',
    disposition: 'cut',
    originSpanOrdinal: 1,
    firstSourceChapter: 1,
    lastSourceChapter: 2,
    effectiveFromOutput,
    ...extra,
  };
}

describe('buildSeedCuts', () => {
  it('should seed an entry per dropped arc and per declared cut thread', () => {
    const cuts = buildSeedCuts(SPANS);
    expect(cuts.map(c => c.cutKey).sort()).toEqual(['the-ash-tournament', 'the-sword-scoring-running-gag', 'the-tribunal-subplot']);

    const arc = cuts.find(c => c.cutKey === 'the-ash-tournament');
    expect(arc).toMatchObject({ kind: 'arc', disposition: 'cut', firstSourceChapter: 13, lastSourceChapter: 16 });
    // Chapters 13-16 produce nothing, so the ban starts at the next chapter actually written.
    expect(arc?.effectiveFromOutput).toBe(8);

    // A condense keeps writing its own span, so its cut binds from its own first output chapter.
    expect(cuts.find(c => c.cutKey === 'the-tribunal-subplot')).toMatchObject({ kind: 'thread', disposition: 'condensed', effectiveFromOutput: 5 });
  });

  it('should never re-describe a cut two spans name the same way', () => {
    const duplicated = [
      SPANS[0] as SeedSpan,
      span(2, 5, 12, 'condense', 3, { cutThreads: ['the tribunal subplot'], rationale: 'first description' }),
      SPANS[2] as SeedSpan,
      span(4, 17, 20, 'keep', 4, { cutThreads: ['The Tribunal Subplot'], continuityNotes: 'x', rationale: 'second description' }),
    ];
    const cuts = buildSeedCuts(duplicated);
    expect(cuts.filter(c => c.cutKey === 'the-tribunal-subplot')).toHaveLength(1);
    expect(cuts.find(c => c.cutKey === 'the-tribunal-subplot')?.detail).toBe('first description');
  });

  it('should put a trailing drop past the last output chapter, where nothing can resurface it', () => {
    const trailing = [span(1, 1, 16, 'keep', 16), span(2, 17, 20, 'drop', 0, { arcLabel: 'The Epilogue Filler' })];
    expect(buildSeedCuts(trailing)[0]?.effectiveFromOutput).toBe(17);
  });

  it('should slug a label into a stable merge key', () => {
    expect(slugifyCutKey('The Azure Sect’s Tribunal!')).toBe('the-azure-sect-s-tribunal');
    expect(slugifyCutKey('***')).toBe('cut');
  });
});

describe('buildBridgeDirectives', () => {
  it('should compose a bridge for the span that follows a drop, and for no other span', () => {
    const directives = buildBridgeDirectives(SPANS);
    expect([...directives.keys()]).toEqual([4]);

    const bridge = directives.get(4) as string;
    expect(bridge).toContain('source chapters 13-16 (The Ash Tournament) are cut');
    expect(bridge).toContain('the tenth tournament in a row');
    expect(bridge).toContain('the sword-scoring running gag');
    expect(bridge).toContain('six months have passed and the sect is dissolved');
    expect(bridge).toContain('Do not summarise, flash back to, or have a character recall');
  });
});

describe('selectCutSlice', () => {
  it('should rank the entries this chapter is about to trip over first', () => {
    const entries = [entry('azure-tribunal', 2, { aliases: ['Azure Sect tribunal'] }), entry('sword-scoring', 3), entry('mira-romance', 4)];
    const slice = selectCutSlice(entries, { sourceText: 'The Azure Sect tribunal reconvened at dawn.', outputChapter: 10 });
    expect(slice[0]?.cutKey).toBe('azure-tribunal');
    // Everything else falls back to most-recently-effective first.
    expect(slice.slice(1).map(c => c.cutKey)).toEqual(['mira-romance', 'sword-scoring']);
  });

  it('should hide an entry that does not bind until a later output chapter', () => {
    const entries = [entry('early', 2), entry('later', 40)];
    expect(selectCutSlice(entries, { outputChapter: 10 }).map(c => c.cutKey)).toEqual(['early']);
    expect(
      selectCutSlice(entries)
        .map(c => c.cutKey)
        .sort(),
    ).toEqual(['early', 'later']);
  });

  it('should drop the least-at-risk entries first when the budget bites', () => {
    const entries = [entry('at-risk', 2, { aliases: ['the tribunal'] }), ...Array.from({ length: 40 }, (_, i) => entry(`filler-${i}`, 3 + i))];
    const slice = selectCutSlice(entries, { sourceText: 'the tribunal reconvened', outputChapter: 100, budgetTokens: 120 });

    expect(slice.length).toBeLessThan(entries.length);
    expect(slice[0]?.cutKey).toBe('at-risk');
  });

  it('should render an empty ledger as a plain statement rather than an empty section', () => {
    expect(renderCutLedger([])).toBe('Nothing has been cut yet.');
    expect(renderCutLedger([entry('gone', 3, { replacementNote: 'the power-up is earned in the duel instead' })])).toContain('Instead: the power-up is earned in the duel instead');
  });
});
