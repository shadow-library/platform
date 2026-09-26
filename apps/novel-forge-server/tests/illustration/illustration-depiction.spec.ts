import { describe, expect, it, mock } from 'bun:test';

import { type WriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';
import { IllustrationService } from '@modules/illustration/illustration.service';
import { type Illustration } from '@server/database';

const SECRET = 'Evan is the lost heir of the ridge court';
const FRONTIER = 12;

function fixture() {
  const inserted: Record<string, unknown>[] = [];
  const project = { id: 1n, ownerKind: 'user', ownerId: 2n, storyCurrentChapter: 0, ending: null, endingQuestion: null };
  const db = {
    query: {
      projects: { findFirst: mock(async () => project) },
      chapters: { findFirst: mock(async () => ({ number: FRONTIER })) },
      entities: { findFirst: mock(async () => ({ name: 'Evan Vale', appearance: `Silver hair. ${SECRET}.` })) },
      canonFacts: { findMany: mock(async () => [{ id: 3n, factKey: 'evan_heir', text: SECRET, terms: ['ridge court'], source: 'bible', revealChapter: 40, unlock: null }]) },
      briefs: { findFirst: mock(async () => null) },
      bibleDocuments: { findMany: mock(async () => []) },
      volumes: { findMany: mock(async () => []) },
    },
    insert: mock(() => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return { returning: async () => [{ id: 9n, status: 'active', revision: 1, selectedRef: null, createdAt: new Date(), updatedAt: new Date(), ...values }] };
      },
    })),
  };
  const resolve = mock<(input: Record<string, unknown>) => Promise<unknown>>(async () => ({ references: [], dataUrls: [], warnings: [], capacity: 4, totalBytes: 0 }));
  const forIllustration = mock<(...args: unknown[]) => Promise<unknown>>(async () => ({ rendered: '' }));
  const runChain = mock(async (_projectId: bigint, _kind: string, _target: string, _input: unknown, run: (runId: string) => Promise<unknown>) => ({ result: await run('run-1') }));
  const service = new IllustrationService(
    { getPostgresClient: () => db } as never,
    { getPublicUrl: () => undefined } as never,
    { structured: mock(async () => ({ basePrompt: 'A portrait', subjectFraming: 'bust', styleNotes: 'ink' })), images: mock(async () => []) } as never,
    { forIllustration } as never,
    { runChain } as never,
    {} as never,
    {} as never,
    {} as never,
    { resolve: mock(async () => ({})) } as never,
    { resolve } as never,
    {} as never,
  );
  return { service, inserted, resolve, forIllustration, runChain };
}

describe('IllustrationService.start — as of a chapter', () => {
  it('should refuse a chapter beyond the story frontier before generating anything', async () => {
    const { service, runChain } = fixture();

    await expect(service.start(1n, { subjectType: 'entity', subjectKey: 'hero', depictsChapter: FRONTIER + 1 })).rejects.toMatchObject({ code: 'ILL_016' });
    expect(runChain).not.toHaveBeenCalled();
  });

  it('should refuse a chapter for a subject other than an entity', async () => {
    const { service, runChain } = fixture();

    await expect(service.start(1n, { subjectType: 'cover', depictsChapter: 3 })).rejects.toMatchObject({ code: 'ILL_017' });
    expect(runChain).not.toHaveBeenCalled();
  });

  it('should compose at the chapter with the secret scrubbed from the appearance anchor and keep the chapter on the row', async () => {
    const { service, inserted, resolve, forIllustration } = fixture();

    const round = await service.start(1n, { subjectType: 'entity', subjectKey: 'hero', depictsChapter: 5 });

    const [row] = inserted as { depictsChapter: number; promptSpec: { appearanceAnchor: string } }[];
    expect(row?.depictsChapter).toBe(5);
    expect(row?.promptSpec.appearanceAnchor).toContain('Silver hair.');
    expect(row?.promptSpec.appearanceAnchor).not.toContain('lost heir');
    expect((resolve.mock.calls[0]?.[0] as { depiction: WriterDisclosurePolicy }).depiction.chapter).toBe(5);
    expect((forIllustration.mock.calls[0]?.[3] as { depiction: WriterDisclosurePolicy }).depiction.chapter).toBe(5);
    expect(round.depictsChapter).toBe(5);
  });

  it('should stamp an entity generation with no chapter at the latest final chapter and scrub it there', async () => {
    const { service, inserted } = fixture();

    await service.start(1n, { subjectType: 'entity', subjectKey: 'hero' });

    const [row] = inserted as { depictsChapter: number; promptSpec: Illustration.PromptSpec }[];
    expect(row?.depictsChapter).toBe(FRONTIER);
    expect(row?.promptSpec.appearanceAnchor).not.toContain('lost heir');
    expect(row?.promptSpec.appearanceAsOfChapter).toBeUndefined();
  });

  it('should ask the image model to adjust the present-day anchor when drawn before the latest final chapter', async () => {
    const { service, inserted } = fixture();

    const round = await service.start(1n, { subjectType: 'entity', subjectKey: 'hero', depictsChapter: 5 });

    const [row] = inserted as { promptSpec: Illustration.PromptSpec }[];
    expect(row?.promptSpec.appearanceAsOfChapter).toBe(5);
    expect(round.prompt).toContain("Subject's current appearance — adjust it to how they looked at chapter 5");
    expect(round.prompt).not.toContain('must match exactly');
  });

  it('should leave a cover undated', async () => {
    const { service, inserted } = fixture();

    await service.start(1n, { subjectType: 'cover' });

    expect(inserted[0]).toMatchObject({ depictsChapter: null });
  });
});
