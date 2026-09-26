import { describe, expect, it, mock } from 'bun:test';

import { WriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';
import { IllustrationReferenceService, type ResolveReferencesInput } from '@modules/illustration/illustration-reference.service';

const SECRET = 'Evan is the lost heir of the ridge court';
const depiction = new WriterDisclosurePolicy({
  chapter: 5,
  lockedFacts: [{ factKey: 'evan_heir', text: SECRET, terms: ['ridge court'] }],
  plannerOnly: [],
  plannerPages: [],
  volumeOrdinals: new Map(),
  currentVolumeOrdinal: null,
});

function service(portrait: { imagePath: string; name: string; imageDepictsChapter: number | null }) {
  const db = { query: { entities: { findFirst: mock(async () => portrait) } } };
  const storage = { stat: mock(async () => ({ size: 10, contentType: 'image/png' })), read: mock(async () => ({ bytes: new Uint8Array([1]) })) };
  return new IllustrationReferenceService({ getPostgresClient: () => db } as never, storage as never, { referenceCapacity: mock(async () => 4) } as never);
}

function input(overrides: Partial<ResolveReferencesInput>): ResolveReferencesInput {
  return { projectId: 1n, subjectType: 'entity', subjectKey: 'hero', attached: [], autoReferences: false, depiction, ...overrides };
}

describe('IllustrationReferenceService.resolve — as of a chapter', () => {
  it('should refuse an attached reference that depicts a later chapter with ILL_018', async () => {
    const references = service({ imagePath: 'later.png', name: 'Evan', imageDepictsChapter: 50 });

    await expect(references.resolve(input({ attached: [{ source: 'portrait', sourceId: 'hero', role: 'likeness' }] }))).rejects.toMatchObject({ code: 'ILL_018' });
  });

  it('should drop a carried reference that depicts a later chapter with a warning', async () => {
    const references = service({ imagePath: 'later.png', name: 'Evan', imageDepictsChapter: 50 });

    const resolved = await references.resolve(input({ carried: [{ source: 'portrait', sourceId: 'hero', role: 'likeness' }] }));

    expect(resolved.references).toEqual([]);
    expect(resolved.warnings).toMatchObject([{ code: 'later-chapter', source: 'portrait' }]);
  });

  it('should scrub the secret from the note of an attached reference', async () => {
    const references = service({ imagePath: 'young.png', name: 'Evan', imageDepictsChapter: 2 });

    const resolved = await references.resolve(input({ attached: [{ source: 'portrait', sourceId: 'hero', role: 'likeness', note: `${SECRET}.` }] }));

    expect(resolved.references[0]?.note).not.toContain('lost heir');
    expect(resolved.references[0]?.label).toBe('portrait of Evan');
  });

  it('should take no auto likeness from a portrait of a later chapter', async () => {
    const references = service({ imagePath: 'later.png', name: 'Evan', imageDepictsChapter: 50 });

    const resolved = await references.resolve(input({ autoReferences: true }));

    expect(resolved.references).toEqual([]);
  });
});
