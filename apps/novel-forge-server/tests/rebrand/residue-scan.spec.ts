import { describe, expect, it } from 'bun:test';

import { type GlossaryLike, renderGlossarySlice, scanResidue, selectGlossarySlice } from '@modules/rebrand';

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
