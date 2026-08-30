import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { type AppError } from '@shadow-library/common';

import { ChapterInsertService } from '@modules/generation/chapter-insert.service';
import { parseBriefBody, renderBriefBody, shiftBriefBody, shiftChapterMentions, shiftChapterNumber, shiftChapterReferences } from '@server/common';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_chapter_insert`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

describe('shiftChapterNumber', () => {
  it('should leave a number at or below the insert point alone', () => {
    expect(shiftChapterNumber(4, 5)).toBe(4);
    expect(shiftChapterNumber(5, 5)).toBe(5);
  });

  it('should shift every number above the insert point', () => {
    expect(shiftChapterNumber(6, 5)).toBe(7);
    expect(shiftChapterNumber(100, 5)).toBe(101);
  });
});

describe('shiftChapterMentions', () => {
  it('should rewrite a chapter ref above the insert point and leave the rest', () => {
    expect(shiftChapterMentions('chapter:12', 5)).toBe('chapter:13');
    expect(shiftChapterMentions('chapter:5', 5)).toBe('chapter:5');
    expect(shiftChapterMentions('chapter:4', 5)).toBe('chapter:4');
  });

  it('should rewrite prose mentions in every spelling while preserving their surrounding text', () => {
    expect(shiftChapterMentions('As set up in Chapter 7, the manifest is a forgery.', 5)).toBe('As set up in Chapter 8, the manifest is a forgery.');
    expect(shiftChapterMentions('see ch. 9', 5)).toBe('see ch. 10');
    expect(shiftChapterMentions('see chs 9', 5)).toBe('see chs 10');
    expect(shiftChapterMentions('see chapter #9', 5)).toBe('see chapter #10');
  });

  it('should shift both ends of a range exactly once', () => {
    expect(shiftChapterMentions('chapters 6–9', 5)).toBe('chapters 7–10');
    expect(shiftChapterMentions('chs 6 to 9', 5)).toBe('chs 7 to 10');
    expect(shiftChapterMentions('chapters 4-9', 5)).toBe('chapters 4-10');
  });

  it('should leave numbers that are not chapter references alone', () => {
    expect(shiftChapterMentions('The 9 blades of the covenant met in 1904.', 5)).toBe('The 9 blades of the covenant met in 1904.');
    expect(shiftChapterMentions('The chapel 9 stands empty.', 5)).toBe('The chapel 9 stands empty.');
  });

  it('should accept an explicit delta', () => {
    expect(shiftChapterMentions('chapter:9', 5, 3)).toBe('chapter:12');
  });
});

describe('shiftChapterReferences', () => {
  it('should rewrite every string in a contextRefs array', () => {
    expect(shiftChapterReferences(['chapter:9', 'entity:li_wei', 'chapter:3'], 5)).toEqual(['chapter:10', 'entity:li_wei', 'chapter:3']);
  });

  it('should walk nested knowledge-contract objects', () => {
    const contract = { pov: ['li_wei'], learns: [{ entityKey: 'li_wei', factKey: 'manifest_forged' }], note: 'revealed in chapter 9' };
    expect(shiftChapterReferences(contract, 5)).toEqual({ ...contract, note: 'revealed in chapter 10' });
  });

  it('should pass null and non-string leaves through untouched', () => {
    expect(shiftChapterReferences(null, 5)).toBeNull();
    expect(shiftChapterReferences({ pov: ['li_wei'], count: 9 }, 5)).toEqual({ pov: ['li_wei'], count: 9 });
  });
});

describe('parseBriefBody', () => {
  it('should round-trip a body with no continuation markers', () => {
    const body = renderBriefBody({ objective: 'Li Wei bribes the harbormaster.', events: ['He reaches the office.', 'He offers the bribe.'] });
    expect(renderBriefBody(parseBriefBody(body))).toBe(body);
  });

  it('should round-trip a body carrying every continuation marker', () => {
    const body = renderBriefBody({
      objective: 'Li Wei bribes the harbormaster.',
      events: ['He offers the bribe.'],
      continuesIntoNextChapter: true,
      startsFromPreviousChapter: true,
      handoffBeat: 'hand outstretched, coin unclaimed',
    });
    const parsed = parseBriefBody(body);
    expect(parsed.continuesIntoNextChapter).toBe(true);
    expect(parsed.startsFromPreviousChapter).toBe(true);
    expect(parsed.handoffBeat).toBe('hand outstretched, coin unclaimed');
    expect(renderBriefBody(parsed)).toBe(body);
  });

  it('should not mistake body prose for a marker line', () => {
    const body = renderBriefBody({ objective: 'Handoff beat: the guard notices.', events: ['[CONTINUES INTO NEXT CHAPTER] is quoted here.'] });
    expect(renderBriefBody(parseBriefBody(body))).toBe(body);
  });
});

describe('shiftBriefBody', () => {
  it('should shift chapter numbers quoted in the objective, the events, and the handoff beat', () => {
    const body = renderBriefBody({
      objective: 'Pay off the promise made in chapter 3 and set up chapter 9.',
      events: ['He recalls chapter 7.'],
      continuesIntoNextChapter: true,
      handoffBeat: 'the beat chapter 9 opens from',
    });

    expect(shiftBriefBody(body, 5)).toBe(
      renderBriefBody({
        objective: 'Pay off the promise made in chapter 3 and set up chapter 10.',
        events: ['He recalls chapter 8.'],
        continuesIntoNextChapter: true,
        handoffBeat: 'the beat chapter 10 opens from',
      }),
    );
  });

  it('should leave a body with no chapter mentions byte-identical', () => {
    const body = renderBriefBody({ objective: 'Li Wei bribes the harbormaster.', events: ['He offers the bribe.'] });
    expect(shiftBriefBody(body, 5)).toBe(body);
  });
});

describe.if(pgAvailable)('ChapterInsertService.insertAfter', () => {
  let db: PrimaryDatabase;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  function buildService(outlined?: unknown[]): { service: ChapterInsertService; structured: ReturnType<typeof mock> } {
    const structured = mock(async () => outlined ?? []);
    const contextAssembler = { forOutline: mock(async () => ({ rendered: 'CATALOG' })) } as never;
    const service = new ChapterInsertService({ getPostgresClient: () => db } as never, { structured } as never, contextAssembler);
    return { service, structured };
  }

  interface Fixture {
    chapters?: number;
    finalizedThrough?: number;
    activeJobStatus?: 'pending' | 'in_progress' | 'done';
  }

  async function seed({ chapters = 8, finalizedThrough = 0, activeJobStatus }: Fixture = {}): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `insert-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.volumes).values([
      { projectId, volumeKey: 'vol_1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 4, targetChapterCount: 4 },
      { projectId, volumeKey: 'vol_2', ordinal: 2, status: 'approved', startChapter: 5, endChapter: chapters, targetChapterCount: chapters - 4 },
    ]);
    await db.insert(schema.arcs).values([
      { projectId, arcKey: 'arc_1', volumeKey: 'vol_1', ordinal: 1, status: 'approved', chapterStart: 1, chapterEnd: 4 },
      { projectId, arcKey: 'arc_2', volumeKey: 'vol_2', ordinal: 2, status: 'approved', chapterStart: 5, chapterEnd: chapters },
    ]);
    await db.insert(schema.briefs).values(
      Array.from({ length: chapters }, (_, i) => ({
        projectId,
        chapter: i + 1,
        volumeKey: i < 4 ? 'vol_1' : 'vol_2',
        arcKey: i < 4 ? 'arc_1' : 'arc_2',
        title: `Brief ${i + 1}`,
        body: renderBriefBody({ objective: `Objective for chapter ${i + 1}.`, events: [`Beat of chapter ${i + 1}.`] }),
        contextRefs: [`chapter:${i + 1}`, 'entity:li_wei'],
        knowledgeContract: { pov: ['li_wei'], note: `pays off chapter ${i + 1}` },
      })),
    );
    await db.insert(schema.drafts).values(Array.from({ length: chapters }, (_, i) => ({ projectId, chapter: i + 1, body: `draft ${i + 1}` })));
    await db.insert(schema.chapterImages).values(Array.from({ length: chapters }, (_, i) => ({ projectId, chapter: i + 1, imagePath: `img-${i + 1}.png` })));
    await db.insert(schema.continuityProposals).values(Array.from({ length: chapters }, (_, i) => ({ projectId, chapter: i + 1, proposal: { note: i + 1 } })));
    await db.insert(schema.canonFacts).values([
      { projectId, factKey: 'fact_early', text: 'early', revealChapter: 3 },
      { projectId, factKey: 'fact_at', text: 'at', revealChapter: 5 },
      { projectId, factKey: 'fact_late', text: 'late', revealChapter: 7 },
      { projectId, factKey: 'fact_unset', text: 'unset' },
    ]);
    await db.insert(schema.mysteries).values([
      { projectId, mysteryKey: 'mystery_early', question: 'early?', status: 'open' as const, payoffWindow: 3 },
      { projectId, mysteryKey: 'mystery_at', question: 'at?', status: 'open' as const, payoffWindow: 5 },
      { projectId, mysteryKey: 'mystery_late', question: 'late?', status: 'open' as const, payoffWindow: 7 },
      { projectId, mysteryKey: 'mystery_unset', question: 'unset?', status: 'open' as const },
    ]);

    const entityRows = await db
      .insert(schema.entities)
      .values([
        { projectId, entityKey: 'li_wei', type: 'character' as const, name: 'Li Wei', firstSeenChapter: 3 },
        { projectId, entityKey: 'shen', type: 'character' as const, name: 'Shen', firstSeenChapter: 5 },
        { projectId, entityKey: 'ru', type: 'character' as const, name: 'Ru', firstSeenChapter: 7 },
        { projectId, entityKey: 'nobody', type: 'character' as const, name: 'Nobody' },
      ])
      .returning();
    const entityId = entityRows[0]?.id;
    if (!entityId) throw new Error('failed to seed entity');

    await db.insert(schema.entityAppearances).values([
      { projectId, entityId, chapter: 3, firstChapter: 3, lastChapter: 3 },
      { projectId, entityId, chapter: 5, firstChapter: 5, lastChapter: 5 },
      { projectId, entityId, chapter: 7, firstChapter: 7, lastChapter: 7 },
    ]);
    await db.insert(schema.entityRelationships).values([
      { projectId, entityId, targetKey: 'shen', kind: 'ally', chapter: 3 },
      { projectId, entityId, targetKey: 'shen', kind: 'rival', chapter: 5 },
      { projectId, entityId, targetKey: 'shen', kind: 'debtor', chapter: 7 },
      { projectId, entityId, targetKey: 'shen', kind: 'unknown' },
    ]);
    await db.insert(schema.relationshipObservations).values([
      { projectId, entityId, targetKey: 'shen', kind: 'ally', chapter: 3 },
      { projectId, entityId, targetKey: 'shen', kind: 'ally', chapter: 5 },
      { projectId, entityId, targetKey: 'shen', kind: 'ally', chapter: 7 },
    ]);
    const factRows = await db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: asc(schema.canonFacts.factKey) });
    await db
      .insert(schema.characterKnowledge)
      .values([3, 5, 7].map((learnedInChapter, i) => ({ projectId, factId: factRows[i]!.id, entityId: entityRows[i]!.id, learnedInChapter })));
    await db.insert(schema.characterStates).values([
      { projectId, entityKey: 'li_wei', lastUpdatedChapter: 3 },
      { projectId, entityKey: 'shen', lastUpdatedChapter: 5 },
      { projectId, entityKey: 'ru', lastUpdatedChapter: 7 },
    ]);
    await db.insert(schema.beats).values([3, 5, 7].map(chapter => ({ projectId, beatKey: `beat_${chapter}`, chapter })));
    await db.insert(schema.worldFacts).values([
      { projectId, category: 'geo', key: 'k3', value: 'v', chapter: 3 },
      { projectId, category: 'geo', key: 'k5', value: 'v', chapter: 5 },
      { projectId, category: 'geo', key: 'k7', value: 'v', chapter: 7 },
      { projectId, category: 'geo', key: 'k_unset', value: 'v' },
    ]);
    await db.insert(schema.contextPacks).values([
      { projectId, purpose: 'draft', hash: 'h3', chapter: 3 },
      { projectId, purpose: 'draft', hash: 'h5', chapter: 5 },
      { projectId, purpose: 'draft', hash: 'h7', chapter: 7 },
      { projectId, purpose: 'draft', hash: 'h_unset' },
    ]);
    await db.insert(schema.plotThreads).values([
      { projectId, threadKey: 'thread_opened', status: 'open' as const, openedChapter: 3, closedChapter: 5, lastAdvancedChapter: 7 },
      { projectId, threadKey: 'thread_early', status: 'open' as const, payoffWindow: 3 },
      { projectId, threadKey: 'thread_at', status: 'open' as const, payoffWindow: 5 },
      { projectId, threadKey: 'thread_late', status: 'open' as const, payoffWindow: 7 },
      { projectId, threadKey: 'thread_unset', status: 'open' as const },
    ]);

    if (finalizedThrough > 0) {
      await db
        .insert(schema.chapters)
        .values(Array.from({ length: finalizedThrough }, (_, i) => ({ projectId, number: i + 1, status: 'done' as const, content: `prose ${i + 1}` })));
    }
    if (activeJobStatus) await db.insert(schema.jobs).values({ projectId, kind: 'generate', target: '1', status: activeJobStatus });

    return projectId;
  }

  const HAND = { briefOrigin: 'hand' as const, briefBody: 'The inserted chapter body.' };

  const PLANNER_OUTPUT = [
    {
      chapter: 6,
      volumeKey: 'vol_2',
      title: 'The Interlude',
      objective: 'Li Wei breaks the covenant.',
      events: ['He burns the manifest.'],
      requiredContext: ['entity:li_wei'],
      endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'what now', handoffState: 'ash', mustNotResolve: [] },
      chapterPurpose: 'Turns the arc.',
      readerValue: ['power_or_stakes_change'],
    },
  ];

  // `toThrow` matches the message, never the code — asserting the code is what these guards are about.
  async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    const error = (await promise.then(
      () => null,
      (err: AppError) => err,
    )) as AppError | null;
    expect(error?.code).toBe(code);
  }

  describe('guards', () => {
    it('should refuse an insert behind the write frontier with CHP_003', async () => {
      const { service } = buildService();
      const projectId = await seed({ finalizedThrough: 5 });
      await expectCode(service.insertAfter(projectId, 4, HAND), 'CHP_003');
    });

    it('should allow an insert exactly at the write frontier', async () => {
      const { service } = buildService();
      const projectId = await seed({ finalizedThrough: 5 });
      const result = await service.insertAfter(projectId, 5, HAND);
      expect(result.newChapter).toBe(6);
    });

    it('should allow an insert ahead of the write frontier', async () => {
      const { service } = buildService();
      const projectId = await seed({ finalizedThrough: 5 });
      const result = await service.insertAfter(projectId, 6, HAND);
      expect(result.newChapter).toBe(7);
    });

    it('should treat a project with no finalized chapters as having frontier 0', async () => {
      const { service } = buildService();
      const projectId = await seed();
      const result = await service.insertAfter(projectId, 0, HAND);
      expect(result.newChapter).toBe(1);
    });

    it('should clamp an insert ahead of chapter 1 into the first arc and volume rather than orphaning it', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      const { brief } = await service.insertAfter(projectId, 0, HAND);

      expect(brief.chapter).toBe(1);
      expect(brief.volumeKey).toBe('vol_1');
      expect(brief.arcKey).toBe('arc_1');

      const [arcs, volumes] = await Promise.all([
        db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId), orderBy: asc(schema.arcs.ordinal) }),
        db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) }),
      ]);
      expect(arcs.map(a => [a.chapterStart, a.chapterEnd])).toEqual([
        [1, 5],
        [6, 9],
      ]);
      expect(volumes.map(v => [v.startChapter, v.endChapter, v.targetChapterCount])).toEqual([
        [1, 5, 5],
        [6, 9, 4],
      ]);
    });

    it('should refuse an insert past the highest planned chapter with CHP_001', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });
      await expectCode(service.insertAfter(projectId, 9, HAND), 'CHP_001');
      await expectCode(service.insertAfter(projectId, 10_000, HAND), 'CHP_001');
    });

    it('should allow an insert after the highest planned chapter itself', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });
      const result = await service.insertAfter(projectId, 8, HAND);
      expect(result.newChapter).toBe(9);
    });

    it('should run the planner call before the transaction opens and re-assert both guards inside it', async () => {
      const projectId = await seed({ chapters: 8 });
      const observed: string[] = [];
      const structured = mock(async () => {
        // A generate job that starts while the planner is running must still be caught: the pre-call
        // guard has already passed, so only the in-transaction re-assertion can reject this.
        observed.push('model');
        await db.insert(schema.jobs).values({ projectId, kind: 'generate', target: 'racing', status: 'in_progress' });
        return PLANNER_OUTPUT;
      });
      const service = new ChapterInsertService(
        { getPostgresClient: () => db } as never,
        { structured } as never,
        {
          forOutline: mock(async () => ({ rendered: 'CATALOG' })),
        } as never,
      );

      await expectCode(service.insertAfter(projectId, 5, { briefOrigin: 'planner', intent: 'a dark interlude' }), 'CHP_004');
      expect(observed).toEqual(['model']);

      const briefs = await db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });
      expect(briefs.map(b => b.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should refuse an insert while a generate job is pending or in progress with CHP_004', async () => {
      const { service } = buildService();
      for (const activeJobStatus of ['pending', 'in_progress'] as const) {
        const projectId = await seed({ activeJobStatus });
        await expectCode(service.insertAfter(projectId, 5, HAND), 'CHP_004');
      }
    });

    it('should allow an insert once the generate job is done', async () => {
      const { service } = buildService();
      const projectId = await seed({ activeJobStatus: 'done' });
      const result = await service.insertAfter(projectId, 5, HAND);
      expect(result.newChapter).toBe(6);
    });

    it('should refuse a hand insert with no body and a planner insert with no intent', async () => {
      const { service } = buildService();
      const projectId = await seed();
      await expect(service.insertAfter(projectId, 5, { briefOrigin: 'hand' })).rejects.toThrow();
      await expect(service.insertAfter(projectId, 5, { briefOrigin: 'planner' })).rejects.toThrow();
    });

    it('should refuse an insert on an unknown project with PRJ_001', async () => {
      const { service } = buildService();
      await expectCode(service.insertAfter(9_999_999n, 5, HAND), 'PRJ_001');
    });
  });

  describe('the shift', () => {
    it('should renumber every chapter-keyed table above the insert point exactly once', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8, finalizedThrough: 3 });

      await service.insertAfter(projectId, 5, HAND);

      const [briefs, drafts, images, proposals] = await Promise.all([
        db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) }),
        db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter) }),
        db.query.chapterImages.findMany({ where: eq(schema.chapterImages.projectId, projectId), orderBy: asc(schema.chapterImages.chapter) }),
        db.query.continuityProposals.findMany({ where: eq(schema.continuityProposals.projectId, projectId), orderBy: asc(schema.continuityProposals.chapter) }),
      ]);

      expect(briefs.map(b => b.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(drafts.map(d => d.chapter)).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
      expect(images.map(i => i.chapter)).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
      expect(proposals.map(p => p.chapter)).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
      expect(drafts.find(d => d.chapter === 7)?.body).toBe('draft 6');
    });

    it('should leave finalized chapters where they are and move only the unfinalized ones', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8, finalizedThrough: 6 });

      await service.insertAfter(projectId, 6, HAND);

      const chapters = await db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: asc(schema.chapters.number) });
      expect(chapters.map(c => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(chapters.map(c => c.content)).toEqual(['prose 1', 'prose 2', 'prose 3', 'prose 4', 'prose 5', 'prose 6']);
    });

    it('should report how many briefs it renumbered', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });
      const result = await service.insertAfter(projectId, 5, HAND);
      expect(result.shiftedChapters).toBe(3);
    });
  });

  describe('reference rewriting', () => {
    it('should re-render each shifted brief body against the new numbering', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 5, HAND);

      const shifted = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 7)) });
      expect(shifted?.body).toBe(renderBriefBody({ objective: 'Objective for chapter 7.', events: ['Beat of chapter 7.'] }));
    });

    it('should leave briefs at or below the insert point untouched', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 5, HAND);

      const kept = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 5)) });
      expect(kept?.body).toBe(renderBriefBody({ objective: 'Objective for chapter 5.', events: ['Beat of chapter 5.'] }));
      expect(kept?.contextRefs).toEqual(['chapter:5', 'entity:li_wei']);
    });

    it('should rewrite contextRefs and knowledgeContract on shifted briefs', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 5, HAND);

      const shifted = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 8)) });
      expect(shifted?.contextRefs).toEqual(['chapter:8', 'entity:li_wei']);
      expect(shifted?.knowledgeContract).toEqual({ pov: ['li_wei'], note: 'pays off chapter 8' });
    });

    it('should shift only the canon-fact reveal chapters above the insert point', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 5, HAND);

      const facts = await db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId), orderBy: asc(schema.canonFacts.factKey) });
      const byKey = new Map(facts.map(f => [f.factKey, f.revealChapter]));
      expect(byKey.get('fact_early')).toBe(3);
      expect(byKey.get('fact_at')).toBe(5);
      expect(byKey.get('fact_late')).toBe(8);
      expect(byKey.get('fact_unset')).toBeNull();
    });
  });

  // Every chapter-number column the insert renumbers outside the five brief/draft/chapter tables. The
  // mapping is the same for all of them: below and at the insert point stand still, above moves by one,
  // and an unset value stays unset.
  describe('chapter pointer columns', () => {
    let projectId: bigint;

    beforeAll(async () => {
      const { service } = buildService();
      projectId = await seed({ chapters: 8 });
      await service.insertAfter(projectId, 5, HAND);
    });

    const cases: { column: string; read: () => Promise<(number | null)[]>; expected: (number | null)[] }[] = [
      {
        column: 'character_knowledge.learned_in_chapter',
        read: async () => (await db.query.characterKnowledge.findMany({ where: eq(schema.characterKnowledge.projectId, projectId) })).map(r => r.learnedInChapter),
        expected: [3, 5, 8],
      },
      {
        column: 'entities.first_seen_chapter',
        read: async () => (await db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId) })).map(r => r.firstSeenChapter),
        expected: [null, 3, 5, 8],
      },
      {
        column: 'entity_appearances.chapter',
        read: async () => (await db.query.entityAppearances.findMany({ where: eq(schema.entityAppearances.projectId, projectId) })).map(r => r.chapter),
        expected: [3, 5, 8],
      },
      {
        column: 'entity_appearances.last_chapter',
        read: async () => (await db.query.entityAppearances.findMany({ where: eq(schema.entityAppearances.projectId, projectId) })).map(r => r.lastChapter),
        expected: [3, 5, 8],
      },
      {
        column: 'entity_relationships.chapter',
        read: async () => (await db.query.entityRelationships.findMany({ where: eq(schema.entityRelationships.projectId, projectId) })).map(r => r.chapter),
        expected: [null, 3, 5, 8],
      },
      {
        column: 'relationship_observations.chapter',
        read: async () => (await db.query.relationshipObservations.findMany({ where: eq(schema.relationshipObservations.projectId, projectId) })).map(r => r.chapter),
        expected: [3, 5, 8],
      },
      {
        column: 'character_states.last_updated_chapter',
        read: async () => (await db.query.characterStates.findMany({ where: eq(schema.characterStates.projectId, projectId) })).map(r => r.lastUpdatedChapter),
        expected: [3, 5, 8],
      },
      {
        column: 'beats.chapter',
        read: async () => (await db.query.beats.findMany({ where: eq(schema.beats.projectId, projectId) })).map(r => r.chapter),
        expected: [3, 5, 8],
      },
      {
        column: 'world_facts.chapter',
        read: async () => (await db.query.worldFacts.findMany({ where: eq(schema.worldFacts.projectId, projectId) })).map(r => r.chapter),
        expected: [null, 3, 5, 8],
      },
      {
        column: 'context_packs.chapter',
        read: async () => (await db.query.contextPacks.findMany({ where: eq(schema.contextPacks.projectId, projectId) })).map(r => r.chapter),
        expected: [null, 3, 5, 8],
      },
      {
        column: 'canon_facts.reveal_chapter',
        read: async () => (await db.query.canonFacts.findMany({ where: eq(schema.canonFacts.projectId, projectId) })).map(r => r.revealChapter),
        expected: [null, 3, 5, 8],
      },
      {
        column: 'plot_threads.payoff_window',
        read: async () => (await db.query.plotThreads.findMany({ where: eq(schema.plotThreads.projectId, projectId) })).map(r => r.payoffWindow),
        expected: [null, null, 3, 5, 8],
      },
      {
        column: 'plot_threads.opened_chapter / closed_chapter / last_advanced_chapter',
        read: async () => {
          const thread = await db.query.plotThreads.findFirst({ where: and(eq(schema.plotThreads.projectId, projectId), eq(schema.plotThreads.threadKey, 'thread_opened')) });
          return [thread?.openedChapter ?? null, thread?.closedChapter ?? null, thread?.lastAdvancedChapter ?? null];
        },
        expected: [3, 5, 8],
      },
      {
        column: 'mysteries.payoff_window',
        read: async () => (await db.query.mysteries.findMany({ where: eq(schema.mysteries.projectId, projectId) })).map(r => r.payoffWindow),
        expected: [null, 3, 5, 8],
      },
    ];

    for (const { column, read, expected } of cases) {
      it(`should shift only the values above the insert point in ${column}`, async () => {
        const values = await read();
        const sorted = [...values].sort((a, b) => (a ?? -1) - (b ?? -1));
        expect(sorted).toEqual(expected);
      });
    }
  });

  describe('plan growth', () => {
    it('should grow the containing arc and shift every later arc', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 2, HAND);

      const arcs = await db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId), orderBy: asc(schema.arcs.ordinal) });
      expect(arcs.map(a => [a.chapterStart, a.chapterEnd])).toEqual([
        [1, 5],
        [6, 9],
      ]);
      expect(arcs.every(a => a.staleReason === null)).toBe(true);
    });

    it('should grow the containing volume and shift every later volume', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 2, HAND);

      const volumes = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) });
      expect(volumes.map(v => [v.startChapter, v.endChapter, v.targetChapterCount])).toEqual([
        [1, 5, 5],
        [6, 9, 4],
      ]);
      expect(volumes.every(v => v.staleReason === null)).toBe(true);
    });

    it('should grow the arc that ends exactly at the insert point so the new chapter is covered', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 4, HAND);

      const arcs = await db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId), orderBy: asc(schema.arcs.ordinal) });
      expect(arcs.map(a => [a.chapterStart, a.chapterEnd])).toEqual([
        [1, 5],
        [6, 9],
      ]);
    });
  });

  describe('the new slot', () => {
    it('should land a hand-written brief verbatim as an external hand-edited slot', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      const { brief } = await service.insertAfter(projectId, 5, HAND);

      expect(brief.chapter).toBe(6);
      expect(brief.body).toBe(HAND.briefBody);
      expect(brief.writeMode).toBe('external');
      expect(brief.handEdited).toBe(true);
      expect(brief.insertedAt).not.toBeNull();
      expect(brief.volumeKey).toBe('vol_2');
      expect(brief.arcKey).toBe('arc_2');
    });

    it('should render a planner-authored brief from the outline output', async () => {
      const { service, structured } = buildService(PLANNER_OUTPUT);
      const projectId = await seed({ chapters: 8 });

      const { brief } = await service.insertAfter(projectId, 5, { briefOrigin: 'planner', intent: 'Li Wei burns the manifest.' });

      expect(structured).toHaveBeenCalled();
      expect(brief.body).toBe(renderBriefBody({ objective: 'Li Wei breaks the covenant.', events: ['He burns the manifest.'] }));
      expect(brief.title).toBe('The Interlude');
      expect(brief.contextRefs).toEqual(['entity:li_wei']);
      expect(brief.writeMode).toBe('external');
      expect(brief.handEdited).toBe(true);
    });

    it('should mark every descendant draft stale from the insert point', async () => {
      const { service } = buildService();
      const projectId = await seed({ chapters: 8 });

      await service.insertAfter(projectId, 5, HAND);

      const drafts = await db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter) });
      expect(drafts.filter(d => d.staleReason !== null).map(d => d.chapter)).toEqual([7, 8, 9]);
    });
  });

  describe('rollback', () => {
    it('should leave no partial state when the slot insert fails', async () => {
      const projectId = await seed({ chapters: 8 });
      const before = await db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) });

      // Failing at the plan-growth step stands in for any mid-transaction failure: by then every table
      // has already been renumbered, so a leaked partial state would be visible here.
      const { service: failing } = buildService();
      Reflect.set(failing, 'growPlan', () => Promise.reject(new Error('boom')));
      await expect(failing.insertAfter(projectId, 5, HAND)).rejects.toThrow('boom');

      const [after, drafts, arcs] = await Promise.all([
        db.query.briefs.findMany({ where: eq(schema.briefs.projectId, projectId), orderBy: asc(schema.briefs.chapter) }),
        db.query.drafts.findMany({ where: eq(schema.drafts.projectId, projectId), orderBy: asc(schema.drafts.chapter) }),
        db.query.arcs.findMany({ where: eq(schema.arcs.projectId, projectId), orderBy: asc(schema.arcs.ordinal) }),
      ]);
      expect(after.map(b => ({ chapter: b.chapter, body: b.body }))).toEqual(before.map(b => ({ chapter: b.chapter, body: b.body })));
      expect(drafts.map(d => d.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(drafts.every(d => d.staleReason === null)).toBe(true);
      expect(arcs.map(a => [a.chapterStart, a.chapterEnd])).toEqual([
        [1, 4],
        [5, 8],
      ]);
    });
  });
});
