import { describe, expect, it } from 'bun:test';

import { buildWikiProjections, type BuildWikiProjectionsInput, type WikiEntityInput, type WikiFactInput } from '@modules/publishing/wiki-projection';

function entity(overrides: Partial<WikiEntityInput> = {}): WikiEntityInput {
  return {
    entityKey: 'amara',
    type: 'character',
    name: 'Detective Amara',
    body: 'A weathered detective.',
    motivation: null,
    attributes: null,
    firstSeenChapter: 1,
    imageRef: null,
    wikiVisibility: 'default',
    aliases: [],
    images: [],
    relationships: [],
    ...overrides,
  };
}

function build(input: Partial<BuildWikiProjectionsInput> & { entities: WikiEntityInput[] }): ReturnType<typeof buildWikiProjections> {
  return buildWikiProjections({ facts: [], ordinalByChapter: new Map([[1, 1]]), ...input });
}

function facetKeys(projection: { payload: { facets: { facetKey: string }[] } }): string[] {
  return projection.payload.facets.map(facet => facet.facetKey);
}

describe('buildWikiProjections', () => {
  describe('ordinal translation', () => {
    it('should stamp a pre-story entity (no first-seen chapter) as visible from ordinal 0', () => {
      const [projection] = build({ entities: [entity({ firstSeenChapter: null })] });
      expect(projection?.payload.facets[0]).toMatchObject({ facetKey: 'profile', visibleFromOrdinal: 0 });
      expect(projection?.payload.firstVisibleOrdinal).toBe(0);
    });

    it('should translate the first-seen chapter to its published ordinal, not the chapter number', () => {
      const [projection] = build({ entities: [entity({ firstSeenChapter: 5 })], ordinalByChapter: new Map([[5, 2]]) });
      expect(projection?.payload.facets[0]).toMatchObject({ facetKey: 'profile', visibleFromOrdinal: 2 });
    });

    it('should withhold the profile (and skip the entity) when the first-seen chapter has no published ordinal', () => {
      const projections = build({ entities: [entity({ firstSeenChapter: 9 })], ordinalByChapter: new Map([[1, 1]]) });
      expect(projections).toEqual([]);
    });
  });

  describe('facet rendering', () => {
    it('should render the profile from body, motivation, and sorted attributes', () => {
      const [projection] = build({
        entities: [entity({ body: 'A weathered detective.', motivation: 'Find the truth.', attributes: { rank: 'Detective', precinct: '4th' } })],
      });
      expect(projection?.payload.facets[0]?.content).toBe('A weathered detective.\n\nMotivation: Find the truth.\n\nPrecinct: 4th\nRank: Detective');
    });

    it('should add an alias facet only when aliases exist, sorted and deduplicated in output order', () => {
      const [projection] = build({ entities: [entity({ aliases: ['The Hound', 'Ama'] })] });
      const aliasFacet = projection?.payload.facets.find(facet => facet.facetKey === 'aliases');
      expect(aliasFacet?.content).toBe('Also known as: Ama, The Hound');
    });

    it('should group relationship observations per target and gate each at its earliest published observation', () => {
      const [projection] = build({
        entities: [
          entity({
            relationships: [
              { targetKey: 'boone', kind: 'partner', note: 'Trusts him', chapter: 1 },
              { targetKey: 'boone', kind: 'partner', note: 'Doubts him', chapter: 3 },
              { targetKey: 'vane', kind: 'rival', note: null, chapter: 3 },
            ],
          }),
        ],
        ordinalByChapter: new Map([
          [1, 1],
          [3, 3],
        ]),
      });
      const boone = projection?.payload.facets.find(facet => facet.facetKey === 'rel:boone');
      const vane = projection?.payload.facets.find(facet => facet.facetKey === 'rel:vane');
      expect(boone).toMatchObject({ visibleFromOrdinal: 1, content: 'Partner — boone: Trusts him\nPartner — boone: Doubts him' });
      expect(vane).toMatchObject({ visibleFromOrdinal: 3, content: 'Rival — vane' });
    });

    it('should resolve a relationship target to its display name when the target is a known entity', () => {
      const [amara] = build({
        entities: [entity({ relationships: [{ targetKey: 'boone', kind: 'partner', note: null, chapter: 1 }] }), entity({ entityKey: 'boone', name: 'Sergeant Boone' })],
      });
      const boone = amara?.payload.facets.find(facet => facet.facetKey === 'rel:boone');
      expect(boone?.content).toBe('Partner — Sergeant Boone');
    });

    it('should exclude a relationship observation whose chapter has no published ordinal', () => {
      const [projection] = build({
        entities: [entity({ relationships: [{ targetKey: 'vane', kind: 'rival', note: null, chapter: 9 }] })],
        ordinalByChapter: new Map([[1, 1]]),
      });
      expect(facetKeys(projection!)).not.toContain('rel:vane');
    });
  });

  describe('canon-fact gating', () => {
    const secret: WikiFactInput = { factKey: 'amara_secret', text: 'Amara planted the evidence.', subjects: ['amara'], learnedInChapters: [2] };

    it('should include a fact whose subject matches, stamped at its earliest reveal ordinal', () => {
      const [projection] = build({
        entities: [entity()],
        facts: [secret],
        ordinalByChapter: new Map([
          [1, 1],
          [2, 2],
        ]),
      });
      const factFacet = projection?.payload.facets.find(facet => facet.facetKey === 'fact:amara_secret');
      expect(factFacet).toMatchObject({ content: 'Amara planted the evidence.', visibleFromOrdinal: 2 });
    });

    it('should never include a fact with no ledger rows (unrevealed is a spoiler)', () => {
      const [projection] = build({ entities: [entity()], facts: [{ ...secret, learnedInChapters: [] }] });
      expect(facetKeys(projection!)).not.toContain('fact:amara_secret');
    });

    it('should exclude a fact entirely when its earliest reveal chapter is not yet published', () => {
      const [projection] = build({ entities: [entity()], facts: [secret], ordinalByChapter: new Map([[1, 1]]) });
      expect(facetKeys(projection!)).not.toContain('fact:amara_secret');
    });

    it('should not attach a fact to an entity that is not one of its subjects', () => {
      const [projection] = build({
        entities: [entity()],
        facts: [{ ...secret, subjects: ['boone'] }],
        ordinalByChapter: new Map([
          [1, 1],
          [2, 2],
        ]),
      });
      expect(facetKeys(projection!)).not.toContain('fact:amara_secret');
    });
  });

  describe('visibility and skipping', () => {
    it('should exclude an entity flagged wikiVisibility hidden', () => {
      expect(build({ entities: [entity({ wikiVisibility: 'hidden' })] })).toEqual([]);
    });

    it('should skip an entity whose projection has zero facets', () => {
      expect(build({ entities: [entity({ body: null, motivation: null, attributes: null, aliases: [], relationships: [] })] })).toEqual([]);
    });

    it('should skip an entity whose key cannot satisfy the reader entry-key pattern', () => {
      expect(build({ entities: [entity({ entityKey: 'has spaces' })] })).toEqual([]);
    });
  });

  describe('images', () => {
    it('should push the portrait as the top-level imageRef and gallery images in sort order', () => {
      const [projection] = build({
        entities: [
          entity({
            imageRef: 'aaa.png',
            images: [
              { imageRef: 'z.png', caption: 'Later', sortOrder: 2 },
              { imageRef: 'a.png', caption: null, sortOrder: 1 },
            ],
          }),
        ],
      });
      expect(projection?.payload.imageRef).toBe('aaa.png');
      expect(projection?.payload.images).toEqual([
        { imageRef: 'a.png', sortOrder: 0, visibleFromOrdinal: 1 },
        { imageRef: 'z.png', caption: 'Later', sortOrder: 1, visibleFromOrdinal: 1 },
      ]);
    });
  });

  describe('determinism', () => {
    const facts: WikiFactInput[] = [
      { factKey: 'b_fact', text: 'B.', subjects: ['amara'], learnedInChapters: [2] },
      { factKey: 'a_fact', text: 'A.', subjects: ['amara'], learnedInChapters: [2] },
    ];
    const ordinals = new Map([
      [1, 1],
      [2, 2],
    ]);

    it('should produce a stable contentHash and facet order for identical input', () => {
      const first = build({ entities: [entity({ aliases: ['X'] })], facts, ordinalByChapter: ordinals });
      const second = build({ entities: [entity({ aliases: ['X'] })], facts, ordinalByChapter: ordinals });
      expect(first[0]?.contentHash).toBe(second[0]?.contentHash);
      expect(facetKeys(first[0]!)).toEqual(['profile', 'aliases', 'fact:a_fact', 'fact:b_fact']);
    });

    it('should be invariant to the order of the input fact and relationship arrays', () => {
      const forward = build({
        entities: [entity({ relationships: [{ targetKey: 'boone', kind: 'partner', note: null, chapter: 1 }] })],
        facts,
        ordinalByChapter: ordinals,
      });
      const reversed = build({
        entities: [entity({ relationships: [{ targetKey: 'boone', kind: 'partner', note: null, chapter: 1 }] })],
        facts: [...facts].reverse(),
        ordinalByChapter: ordinals,
      });
      expect(forward[0]?.contentHash).toBe(reversed[0]?.contentHash);
    });
  });
});
