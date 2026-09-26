import { describe, expect, it } from 'bun:test';

import { IllustrationReferenceService, type ResolveReferencesInput } from '@modules/illustration/illustration-reference.service';

interface CastMember {
  entityKey: string;
  name: string;
  imagePath: string;
  imageDepictsChapter: number | null;
}

const CAST: CastMember[] = [
  { entityKey: 'mira', name: 'Mira Solen', imagePath: 'portraits/mira-ch2.png', imageDepictsChapter: 2 },
  { entityKey: 'dace', name: 'Dace Orrin', imagePath: 'portraits/dace-ch5.png', imageDepictsChapter: 5 },
  { entityKey: 'vell', name: 'Captain Vell', imagePath: 'portraits/vell-undated.png', imageDepictsChapter: null },
];

function references(cast: CastMember[] = CAST): { service: IllustrationReferenceService; castReads: () => number } {
  let reads = 0;
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, orderBy: async () => (reads++, cast) };
  const db = { select: () => chain, query: { entities: { findFirst: async () => undefined } } };
  const storage = { stat: async () => ({ size: 10, contentType: 'image/png' }), read: async () => ({ bytes: new Uint8Array([1]) }) };
  const service = new IllustrationReferenceService({ getPostgresClient: () => db } as never, storage as never, { referenceCapacity: () => 4 } as never);
  return { service, castReads: () => reads };
}

const input = (overrides: Partial<ResolveReferencesInput>): ResolveReferencesInput => ({
  projectId: 7n,
  subjectType: 'chapter',
  subjectKey: '3',
  attached: [],
  autoReferences: true,
  load: 'metadata',
  ...overrides,
});

describe('the reference portraits auto-selected for reader-facing art (P4-51)', () => {
  it('should leave out a chapter image cast portrait dated after that chapter and keep earlier and undated ones', async () => {
    const resolved = await references().service.resolve(input({}));

    expect(resolved.references.map(reference => reference.ref)).toEqual(['portraits/mira-ch2.png', 'portraits/vell-undated.png']);
  });

  it('should keep a portrait dated at the chapter itself', async () => {
    const resolved = await references().service.resolve(input({ subjectKey: '5' }));

    expect(resolved.references.map(reference => reference.ref)).toContain('portraits/dace-ch5.png');
  });

  it('should select no portrait at all for a cover, so none can show past the latest final chapter', async () => {
    const { service, castReads } = references();

    const resolved = await service.resolve(input({ subjectType: 'cover', subjectKey: null }));

    expect(resolved.references).toEqual([]);
    expect(castReads()).toBe(0);
  });
});
