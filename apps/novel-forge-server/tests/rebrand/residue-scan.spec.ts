import { describe, expect, it } from 'bun:test';

import { GLOSSARY_SLICE_CAP, type GlossaryLike, renderGlossarySlice, scanResidue, selectGlossarySlice } from '@modules/rebrand';

const glossary: GlossaryLike[] = [
  { sourceName: 'Ye Fan', variants: ['Yefan', 'Ye Fann'], replacement: 'Evan Vale', category: 'character' },
  { sourceName: 'Long Chen', variants: null, replacement: 'Lorcan Vey', category: 'character' },
  { sourceName: 'Huaxia', variants: ['Hua Xia'], replacement: 'Veldram', category: 'country' },
  { sourceName: 'Azure Dragon Sect', variants: [], replacement: 'Order of the Cindered Wyrm', category: 'faction' },
  { sourceName: 'Mira', variants: [], replacement: 'Mira', category: 'character' },
];

describe('residue scan', () => {
  describe('scanResidue', () => {
    it('should flag leftover glossary source names with an excerpt', () => {
      const issues = scanResidue('Evan Vale bowed, but Ye Fan hesitated at the gate.', glossary);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ source: 'residue', type: 'glossary_leftover', detail: '"Ye Fan" should be "Evan Vale"' });
      expect(issues[0]?.excerpt).toContain('Ye Fan hesitated');
    });

    it('should flag variant spellings and report one issue per glossary entry', () => {
      const issues = scanResidue('Yefan smiled. Later, Ye Fann frowned.', glossary);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.type).toBe('glossary_leftover');
    });

    it('should match source names case-sensitively so pinyin-as-English words pass', () => {
      expect(scanResidue('The long chen-shaped road stretched on.', glossary)).toHaveLength(0);
      expect(scanResidue('Long Chen stepped forward.', glossary)).toHaveLength(1);
    });

    it('should skip identity mappings and sub-minimum-length terms', () => {
      const withShort: GlossaryLike[] = [...glossary, { sourceName: 'Ye', variants: [], replacement: 'Vale', category: 'term' }];
      expect(scanResidue('Mira and Ye walked on.', withShort)).toHaveLength(0);
    });

    it('should flag CJK characters', () => {
      const issues = scanResidue('He whispered 龙 before the altar.', glossary);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.type).toBe('cjk');
    });

    it('should flag banned real-world terms case-insensitively on word boundaries', () => {
      const issues = scanResidue('the pride of china stirred', []);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ type: 'banned_term', detail: 'real-world term "China" must not appear' });

      expect(scanResidue('he rubbed his chin and grinned', [])).toHaveLength(0);
    });

    it('should include caller-provided extra banned terms', () => {
      const issues = scanResidue('the Tang envoy arrived', [], ['Tang']);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.type).toBe('banned_term');
    });

    it('should select banned terms from the requested packs, defaulting to east-asian', () => {
      expect(scanResidue('he thought of Persia often', [])).toHaveLength(0);
      expect(scanResidue('he thought of Persia often', [], [], ['western'])).toHaveLength(1);
      expect(scanResidue('the iPhone glowed in the dark', [], [], ['modern-brands'])).toHaveLength(1);
    });

    it('should catch a lowercase glossary leftover for a term with no common-word collision', () => {
      // "Huaxia" also sits in the default east-asian banned-term pack, so it doubles as a banned_term hit.
      const issues = scanResidue('the huaxia banner still flew over the ruins.', glossary);
      expect(issues.map(i => i.type).sort()).toEqual(['banned_term', 'glossary_leftover']);
      expect(issues.find(i => i.type === 'glossary_leftover')).toMatchObject({ detail: '"Huaxia" should be "Veldram"' });
    });
  });

  describe('selectGlossarySlice', () => {
    it('should always include country/culture entries first, then matches by occurrence count', () => {
      const text = 'Long Chen fought. Long Chen won. Ye Fan watched from the Azure Dragon Sect walls.';
      const slice = selectGlossarySlice(text, glossary);
      expect(slice[0]?.sourceName).toBe('Huaxia');
      expect(slice[1]?.sourceName).toBe('Long Chen');
      expect(slice.map(e => e.sourceName)).toContain('Azure Dragon Sect');
      expect(slice.map(e => e.sourceName)).not.toContain('Mira');
    });

    it('should match on replacements so repair and audit passes keep their mappings', () => {
      const slice = selectGlossarySlice('Evan Vale bowed to the elder.', glossary);
      expect(slice.map(e => e.sourceName)).toContain('Ye Fan');
    });

    it('should match on word boundaries, not raw substring search', () => {
      // A substring (indexOf) scan would find "Mira" inside "Miracle"; a word-boundary scan must not.
      const withMira: GlossaryLike[] = [...glossary, { sourceName: 'Sable', variants: [], replacement: 'Sable', category: 'place' }];
      const slice = selectGlossarySlice('A miracle occurred near the Sable gate.', withMira);
      expect(slice.map(e => e.sourceName)).not.toContain('Mira');
      expect(slice.map(e => e.sourceName)).toContain('Sable');
    });

    it('should keep every country/culture entry unconditionally and cap matched entries by occurrence when over budget', () => {
      const worldMap: GlossaryLike[] = [{ sourceName: 'Huaxia', variants: [], replacement: 'Veldram', category: 'country' }];
      const many: GlossaryLike[] = Array.from({ length: 5 }, (_, i) => ({ sourceName: `Char${i}`, variants: [], replacement: `Rep${i}`, category: 'character' }));
      const text = many.map((e, i) => `${e.sourceName} `.repeat(5 - i)).join(' ');
      const slice = selectGlossarySlice(text, [...worldMap, ...many], 3);
      expect(slice[0]?.sourceName).toBe('Huaxia');
      expect(slice).toHaveLength(3);
      expect(slice.map(e => e.sourceName)).toEqual(['Huaxia', 'Char0', 'Char1']);
    });

    it('should never drop a country/culture entry to enforce the cap', () => {
      const worldMap: GlossaryLike[] = Array.from({ length: 5 }, (_, i) => ({ sourceName: `Nation${i}`, variants: [], replacement: `Rep${i}`, category: 'country' }));
      const slice = selectGlossarySlice('no matches here', worldMap, 3);
      expect(slice).toHaveLength(5);
    });

    it('should default the cap to GLOSSARY_SLICE_CAP', () => {
      const many: GlossaryLike[] = Array.from({ length: GLOSSARY_SLICE_CAP + 10 }, (_, i) => ({
        sourceName: `Char${i}`,
        variants: [],
        replacement: `Rep${i}`,
        category: 'character',
      }));
      const text = many.map(e => e.sourceName).join(' ');
      expect(selectGlossarySlice(text, many)).toHaveLength(GLOSSARY_SLICE_CAP);
    });
  });

  describe('renderGlossarySlice', () => {
    it('should render one line per mapping with variants and notes', () => {
      const rendered = renderGlossarySlice([{ sourceName: 'Ye Fan', variants: ['Yefan'], replacement: 'Evan Vale', category: 'character', notes: 'the protagonist' }]);
      expect(rendered).toBe('Ye Fan (also: Yefan) → Evan Vale [character] — the protagonist');
    });

    it('should explain an empty slice instead of rendering nothing', () => {
      expect(renderGlossarySlice([])).toContain('discoveredNames');
    });
  });
});
