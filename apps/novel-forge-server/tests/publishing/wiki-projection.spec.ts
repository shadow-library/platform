import { describe, expect, it } from 'bun:test';
import { computeContentHash } from '@shadow-library/sdk/publishing';

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

  describe('images as of a chapter', () => {
    const ordinals = new Map([
      [1, 1],
      [3, 3],
      [50, 50],
    ]);

    // What web-novel-server serves at `gate`: the entry once it is visible, its headline once past its own gate, then its images and captions gated one by one.
    function readerView(projection: ReturnType<typeof buildWikiProjections>[number] | undefined, gate: number): { imageRef?: string; images: string[]; captions: string[] } {
      if (!projection || projection.payload.firstVisibleOrdinal > gate) return { images: [], captions: [] };
      const images = projection.payload.images.filter(image => image.visibleFromOrdinal <= gate);
      const headlineShown = (projection.payload.imageVisibleFromOrdinal ?? 0) <= gate;
      return {
        imageRef: headlineShown ? projection.payload.imageRef : undefined,
        images: images.map(image => image.imageRef),
        captions: images.flatMap(image => (image.caption ? [image.caption] : [])),
      };
    }

    const lateCharacter = entity({
      imageRef: 'scarred.png',
      imageDepictsChapter: 50,
      images: [{ imageRef: 'crowned.png', caption: 'Crowned after the siege', sortOrder: 0, depictsChapter: 50 }],
    });

    it('should keep a chapter-50 portrait as the headline gated at chapter 50 for a gate-capable reader, hidden with its gallery from chapter-1 readers', () => {
      const [projection] = build({ entities: [lateCharacter], ordinalByChapter: ordinals, headlineGate: true });

      expect(projection?.payload).toMatchObject({ imageRef: 'scarred.png', imageVisibleFromOrdinal: 50, firstVisibleOrdinal: 1 });
      expect(readerView(projection, 1)).toEqual({ imageRef: undefined, images: [], captions: [] });
      expect(readerView(projection, 50)).toEqual({ imageRef: 'scarred.png', images: ['crowned.png'], captions: ['Crowned after the siege'] });
    });

    it('should demote a chapter-50 portrait to the gated gallery for a reader that cannot gate the headline', () => {
      const [projection] = build({ entities: [lateCharacter], ordinalByChapter: ordinals });

      expect(projection?.payload.imageRef).toBeUndefined();
      expect(projection?.payload).not.toHaveProperty('imageVisibleFromOrdinal');
      expect(projection?.payload.images[0]).toEqual({ imageRef: 'scarred.png', sortOrder: 0, visibleFromOrdinal: 50 });
      expect(readerView(projection, 1)).toEqual({ imageRef: undefined, images: [], captions: [] });
      expect(readerView(projection, 50)).toEqual({ imageRef: undefined, images: ['scarred.png', 'crowned.png'], captions: ['Crowned after the siege'] });
    });

    it('should move the hash of a late-portrait entry, and only that entry, when the reader gains the capability', () => {
      const early = entity({ entityKey: 'boone', imageRef: 'young.png', imageDepictsChapter: 1 });
      const without = build({ entities: [lateCharacter, early], ordinalByChapter: ordinals });
      const withGate = build({ entities: [lateCharacter, early], ordinalByChapter: ordinals, headlineGate: true });

      expect(withGate.map(projection => projection.entryKey)).toEqual(['amara', 'boone']);
      expect(withGate[0]?.contentHash).not.toBe(without[0]?.contentHash);
      expect(withGate[1]?.contentHash).toBe(without[1]?.contentHash ?? '');
    });

    it('should keep a portrait no later than the entry itself as the top-level image, without a gate', () => {
      const [projection] = build({ entities: [entity({ imageRef: 'young.png', imageDepictsChapter: 1 })], ordinalByChapter: ordinals });

      expect(projection?.payload.imageRef).toBe('young.png');
      expect(projection?.payload).not.toHaveProperty('imageVisibleFromOrdinal');
      expect(projection?.payload.images).toEqual([]);
    });

    it('should withhold an image whose depicted chapter is not published yet', () => {
      const [projection] = build({
        entities: [entity({ imageRef: 'future.png', imageDepictsChapter: 60, images: [{ imageRef: 'later.png', caption: 'Later', sortOrder: 0, depictsChapter: 60 }] })],
        ordinalByChapter: ordinals,
      });

      expect(projection?.payload.imageRef).toBeUndefined();
      expect(projection?.payload.images).toEqual([]);
    });

    it('should keep a legacy undated portrait as the headline and its gallery at the old ordinal', () => {
      const [projection] = build({
        entities: [
          entity({
            firstSeenChapter: 3,
            imageRef: 'legacy.png',
            images: [{ imageRef: 'sketch.png', caption: 'Old sketch', sortOrder: 0 }],
            relationships: [{ targetKey: 'boone', kind: 'rival', note: null, chapter: 1 }],
          }),
        ],
        ordinalByChapter: ordinals,
      });

      expect(projection?.payload.imageRef).toBe('legacy.png');
      expect(projection?.payload).not.toHaveProperty('imageVisibleFromOrdinal');
      expect(projection?.payload.images).toEqual([{ imageRef: 'sketch.png', caption: 'Old sketch', sortOrder: 0, visibleFromOrdinal: 3 }]);
    });

    it('should keep the old ordinal 0 for a legacy gallery when the entity is visible only through a relationship with no chapter', () => {
      const [projection] = build({
        entities: [
          entity({
            firstSeenChapter: 9,
            imageRef: 'legacy.png',
            images: [
              { imageRef: 'old.png', caption: null, sortOrder: 0 },
              { imageRef: 'dated.png', caption: 'Dated', sortOrder: 1, depictsChapter: 3 },
            ],
            relationships: [{ targetKey: 'boone', kind: 'rival', note: null, chapter: null }],
          }),
        ],
        ordinalByChapter: ordinals,
      });

      expect(projection?.payload.firstVisibleOrdinal).toBe(0);
      expect(projection?.payload.imageRef).toBe('legacy.png');
      expect(projection?.payload.images).toEqual([
        { imageRef: 'old.png', sortOrder: 0, visibleFromOrdinal: 0 },
        { imageRef: 'dated.png', caption: 'Dated', sortOrder: 1, visibleFromOrdinal: 3 },
      ]);
    });

    it('should show an image dated before the story from ordinal 0', () => {
      const [projection] = build({ entities: [entity({ images: [{ imageRef: 'child.png', caption: null, sortOrder: 0, depictsChapter: 0 }] })], ordinalByChapter: ordinals });

      expect(projection?.payload.images).toEqual([{ imageRef: 'child.png', sortOrder: 0, visibleFromOrdinal: 0 }]);
    });

    it('should leave the payload of a legacy portrait unchanged by dating', () => {
      const undated = build({ entities: [entity({ imageRef: 'legacy.png' })] });
      const datedAtFirstSighting = build({ entities: [entity({ imageRef: 'legacy.png', imageDepictsChapter: 1 })] });

      expect(undated[0]?.payload.imageRef).toBe('legacy.png');
      expect(undated[0]?.contentHash).toBe(datedAtFirstSighting[0]?.contentHash ?? '');
    });

    it('should keep the historical digest of an undated portrait', () => {
      const [projection] = build({ entities: [entity({ imageRef: 'legacy.png' })] });

      expect(projection?.contentHash).toBe(computeContentHash({ ...projection?.payload }));
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
