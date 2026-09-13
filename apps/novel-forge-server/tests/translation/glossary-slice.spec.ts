import { describe, expect, it } from 'bun:test';

import { LATIN_PROFILE, renderTranslationGlossarySlice, selectTranslationGlossarySlice, TRANSLATION_GLOSSARY_SLICE_CAP, type TranslationTermLike } from '@modules/translation';

const entries: TranslationTermLike[] = [
  { id: 'approved-1', sourceTerm: 'Ye Fan', variants: ['Yefan'], target: 'Evan Vale', category: 'character', treatment: 'translate', status: 'approved', revision: 3 },
  { id: 'preserve-1', sourceTerm: 'Aura', variants: [], target: 'Aura', category: 'term', treatment: 'preserve', status: 'suggested', revision: 1 },
  { id: 'suggested-1', sourceTerm: 'Long Chen', variants: [], target: 'Lorcan Vey', category: 'character', treatment: 'translate', status: 'suggested', revision: 0 },
  { id: 'rejected-1', sourceTerm: 'Mira', variants: [], target: 'Mira', category: 'character', treatment: 'translate', status: 'rejected' },
  { sourceTerm: 'Unseen', variants: [], target: 'Unseen', category: 'term', treatment: 'translate', status: 'approved' },
];

describe('selectTranslationGlossarySlice', () => {
  it('should only include entries whose source term occurs in the original text', () => {
    const slice = selectTranslationGlossarySlice('Ye Fan cultivated his Aura.', entries, LATIN_PROFILE);
    expect(slice.entries.map(e => e.sourceTerm)).toEqual(expect.arrayContaining(['Ye Fan', 'Aura']));
    expect(slice.entries.map(e => e.sourceTerm)).not.toContain('Long Chen');
    expect(slice.entries.map(e => e.sourceTerm)).not.toContain('Unseen');
  });

  it('should rank approved and preserve-treatment entries ahead of suggested entries', () => {
    const text = 'Long Chen fought. Long Chen won. Long Chen roared. Ye Fan cultivated his Aura.';
    const slice = selectTranslationGlossarySlice(text, entries, LATIN_PROFILE);
    const order = slice.entries.map(e => e.id);
    expect(order.indexOf('approved-1')).toBeLessThan(order.indexOf('suggested-1'));
    expect(order.indexOf('preserve-1')).toBeLessThan(order.indexOf('suggested-1'));
  });

  it('should return rejected-but-present entries separately and never count them against the cap', () => {
    const slice = selectTranslationGlossarySlice('Mira walked away.', entries, LATIN_PROFILE, 0);
    expect(slice.entries).toHaveLength(0);
    expect(slice.rejected.map(e => e.id)).toEqual(['rejected-1']);
  });

  it('should drop the lowest-priority matches once over the cap', () => {
    const text = 'Ye Fan cultivated his Aura. Long Chen fought.';
    const slice = selectTranslationGlossarySlice(text, entries, LATIN_PROFILE, 1);
    expect(slice.entries).toHaveLength(1);
    expect(['Ye Fan', 'Aura']).toContain(slice.entries[0]?.sourceTerm);
  });

  it('should map kept entry ids to their revision, skipping entries without an id', () => {
    const slice = selectTranslationGlossarySlice('Ye Fan cultivated his Aura. Unseen forces stirred.', entries, LATIN_PROFILE);
    expect(slice.appliedTerms).toEqual({ 'approved-1': 3, 'preserve-1': 1 });
  });

  it('should default the cap to TRANSLATION_GLOSSARY_SLICE_CAP', () => {
    const many: TranslationTermLike[] = Array.from({ length: TRANSLATION_GLOSSARY_SLICE_CAP + 10 }, (_, i) => ({
      sourceTerm: `Char${i}`,
      variants: [],
      target: `Rep${i}`,
      category: 'character',
      treatment: 'translate',
      status: 'approved',
    }));
    const text = many.map(e => e.sourceTerm).join(' ');
    expect(selectTranslationGlossarySlice(text, many, LATIN_PROFILE).entries).toHaveLength(TRANSLATION_GLOSSARY_SLICE_CAP);
  });
});

describe('renderTranslationGlossarySlice', () => {
  it('should render approved, provisional, and not-terms blocks with the exact headings', () => {
    const slice = selectTranslationGlossarySlice('Ye Fan cultivated his Aura. Long Chen fought. Mira watched.', entries, LATIN_PROFILE);
    const rendered = renderTranslationGlossarySlice(slice);
    expect(rendered).toContain('## Approved terms (binding)');
    expect(rendered).toContain('## Provisional terms (use exactly as given until reviewed)');
    expect(rendered).toContain('## Not terms (translate these normally)');
    expect(rendered).toContain('Ye Fan (also: Yefan) → Evan Vale [character · translate]');
    expect(rendered).toContain('Mira → Mira [character · translate]');
  });

  it('should omit a block that has no entries', () => {
    const slice = selectTranslationGlossarySlice('Ye Fan cultivated his Aura.', entries, LATIN_PROFILE);
    const rendered = renderTranslationGlossarySlice(slice);
    expect(rendered).not.toContain('## Not terms');
  });

  it('should explain when nothing matched at all', () => {
    const slice = selectTranslationGlossarySlice('Nobody relevant appears here.', entries, LATIN_PROFILE);
    expect(renderTranslationGlossarySlice(slice)).toContain('discoveredTerms');
  });
});
