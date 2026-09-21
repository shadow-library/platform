import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { GenerationService } from '@modules/generation/generation.service';
import { emptyPolicy } from '@modules/plugins';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy, noPluginProposals } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_spoiler_guard`;

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

const SECRET_TEXT = 'The lighthouse keeper is secretly the smuggler’s sister.';
const AUTHOR_NOTE = 'Guards the sister reveal in chapter 10.';
const WRITER_NOTE = 'Whenever the keeper is asked about the smuggler, she changes the subject.';
const REVEAL_CHAPTER = 10;
const ENDING_CONTRACT = { hookType: 'turn', emotionalBeat: 'unease', openQuestion: 'who signals?', handoffState: 'fog rolls in', mustNotResolve: [] as string[] };

type ContractMode = 'contract' | 'none';

describe.if(pgAvailable)('hidden facts in the chapter writer’s context', () => {
  let db: PrimaryDatabase;
  let assembler: ContextAssembler;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  async function seedProject(writerNote: string | null, mode: ContractMode, chapters = 12): Promise<bigint> {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `spoiler-${Date.now()}-${Math.random()}`, kind: 'new_novel' })
      .returning();
    if (!project) throw new Error('failed to seed project');
    const projectId = project.id;

    await db.insert(schema.entities).values({ projectId, entityKey: 'keeper', type: 'character', name: 'Keeper' });
    await db
      .insert(schema.canonFacts)
      .values({ projectId, factKey: 'keeper_is_sister', text: SECRET_TEXT, constraintNote: AUTHOR_NOTE, writerNote, terms: ['sister'], revealChapter: REVEAL_CHAPTER });
    await db.insert(schema.briefs).values(
      Array.from({ length: chapters }, (_, i) => {
        const chapter = i + 1;
        const learns = chapter === REVEAL_CHAPTER ? [{ entityKey: 'keeper', factKey: 'keeper_is_sister' }] : [];
        return {
          projectId,
          chapter,
          body: `write chapter ${chapter}`,
          contextRefs: ['fact:keeper_is_sister'],
          endingContract: ENDING_CONTRACT,
          knowledgeContract: mode === 'contract' ? { pov: ['keeper'], learns } : null,
        };
      }),
    );
    return projectId;
  }

  async function ledger(projectId: bigint, learnedInChapter: number, source: 'manual' | 'brief'): Promise<void> {
    const [fact, entity] = await Promise.all([
      db.query.canonFacts.findFirst({ where: eq(schema.canonFacts.projectId, projectId) }),
      db.query.entities.findFirst({ where: eq(schema.entities.projectId, projectId) }),
    ]);
    if (!fact || !entity) throw new Error('failed to seed fact');
    await db
      .insert(schema.characterKnowledge)
      .values({ projectId, factId: fact.id, entityId: entity.id, learnedInChapter, source })
      .onConflictDoUpdate({ target: [schema.characterKnowledge.factId, schema.characterKnowledge.entityId], set: { learnedInChapter, source } });
  }

  async function packFor(projectId: bigint, chapter: number): Promise<{ rendered: string; unresolvedRefs: string[] }> {
    return assembler.forChapter(projectId, chapter, { dryRun: true });
  }

  for (const mode of ['contract', 'none'] as const) {
    describe(`with knowledge contract mode "${mode}"`, () => {
      it('should give chapters before the reveal only the writer note', async () => {
        const projectId = await seedProject(WRITER_NOTE, mode);
        for (let chapter = 1; chapter < REVEAL_CHAPTER; chapter++) {
          const pack = await packFor(projectId, chapter);
          expect(pack.rendered).not.toContain(SECRET_TEXT);
          expect(pack.rendered).not.toContain(AUTHOR_NOTE);
          expect(pack.rendered).not.toContain('keeper_is_sister');
          expect(pack.rendered).toContain(WRITER_NOTE);
          if (mode === 'contract') expect(pack.rendered.split(WRITER_NOTE)).toHaveLength(2);
        }
      });

      it('should withhold a hidden fact entirely when it has no writer note', async () => {
        const projectId = await seedProject(null, mode);
        for (let chapter = 1; chapter < REVEAL_CHAPTER; chapter++) {
          const pack = await packFor(projectId, chapter);
          expect(pack.rendered).not.toContain(SECRET_TEXT);
          expect(pack.rendered).not.toContain(AUTHOR_NOTE);
          expect(pack.rendered).not.toContain('WRITING CONSTRAINT');
          expect(pack.unresolvedRefs).not.toContain('fact:keeper_is_sister');
        }
      });

      it('should let the reveal chapter state the fact without the author note', async () => {
        const projectId = await seedProject(WRITER_NOTE, mode);
        const pack = await packFor(projectId, REVEAL_CHAPTER);
        expect(pack.rendered).toContain(SECRET_TEXT);
        expect(pack.rendered).not.toContain(AUTHOR_NOTE);
      });
    });
  }

  it('should let a chapter after the planned reveal cite the fact when no contract bounds it', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'none');
    const pack = await packFor(projectId, REVEAL_CHAPTER + 1);
    expect(pack.rendered).toContain(SECRET_TEXT);
  });

  it('should not let a character’s private knowledge unlock a fact before its planned reveal', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'none');
    await ledger(projectId, 1, 'manual');
    const pack = await packFor(projectId, 5);
    expect(pack.rendered).not.toContain(SECRET_TEXT);
    expect(pack.rendered).toContain(WRITER_NOTE);
  });

  it('should unlock an unscheduled fact only once a brief has revealed it on the page', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'none');
    await db.update(schema.canonFacts).set({ revealChapter: null }).where(eq(schema.canonFacts.projectId, projectId));
    await ledger(projectId, 1, 'manual');
    expect((await packFor(projectId, 5)).rendered).not.toContain(SECRET_TEXT);

    await ledger(projectId, 3, 'brief');
    expect((await packFor(projectId, 5)).rendered).toContain(SECRET_TEXT);
  });

  it('should keep a fact the POV cast does not know hidden after its planned reveal chapter', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'contract');
    const pack = await packFor(projectId, REVEAL_CHAPTER + 1);
    expect(pack.rendered).not.toContain(SECRET_TEXT);
    expect(pack.rendered).toContain(WRITER_NOTE);
  });

  it('should hide a fact the brief forbids resolving even once it is ledgered', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'none');
    await ledger(projectId, REVEAL_CHAPTER, 'brief');
    await db
      .update(schema.briefs)
      .set({ endingContract: { ...ENDING_CONTRACT, mustNotResolve: ['fact:keeper_is_sister'] } })
      .where(and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 12)));

    expect((await packFor(projectId, 11)).rendered).toContain(SECRET_TEXT);
    const forbidden = await packFor(projectId, 12);
    expect(forbidden.rendered).not.toContain(SECRET_TEXT);
    expect(forbidden.rendered).toContain(WRITER_NOTE);
  });

  it('should gate a revision pack like a drafting pack', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'none');
    const pack = await assembler.forRevision(projectId, 3, 0n);
    expect(pack.rendered).not.toContain(SECRET_TEXT);
    expect(pack.rendered).not.toContain(AUTHOR_NOTE);
    expect(pack.rendered).toContain(WRITER_NOTE);
  });

  it('should resolve a fact ref in full when no chapter scopes it', async () => {
    const projectId = await seedProject(WRITER_NOTE, 'contract');
    const { resolved } = await assembler.resolveRefs(projectId, ['fact:keeper_is_sister']);
    expect(resolved[0]?.rendered).toContain(SECRET_TEXT);
    expect(resolved[0]?.rendered).toContain(AUTHOR_NOTE);
  });

  describe('author and judge notes on their way to the writer', () => {
    const LEAKY_NOTE = [
      `[soft] knowledge leak: "sister" exposes [keeper_is_sister] — …admitted she was his sister…`,
      `[soft] knowledge leak: [keeper_is_sister] the draft states that ${SECRET_TEXT}`,
      '[soft] brief: the lamp is never lit on-page',
      `Also: fact:keeper_is_sister must stay buried (${AUTHOR_NOTE})`,
    ].join('\n');

    function reviseService(feedbacks: string[], briefs: string[] = []): GenerationService {
      const databaseService = { getPostgresClient: () => db } as never;
      const noop = {} as never;
      const modelRouter = {
        structured: async (_prompt: unknown, vars: { feedback: string; chapterBrief: string }) => {
          feedbacks.push(vars.feedback);
          briefs.push(vars.chapterBrief);
          return { title: 'revised', body: 'revised body', summary: 'revised summary', state: {} };
        },
      } as never;
      return new GenerationService(
        databaseService,
        noop,
        modelRouter,
        new ContextAssembler(databaseService, new CatalogService(databaseService)),
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        { resolve: async () => emptyPolicy() } as never,
        noPluginProposals(),
      );
    }

    for (const mode of ['contract', 'none'] as const) {
      it(`should strip the secret from a Repair note and give the writer the safe form (${mode})`, async () => {
        const projectId = await seedProject(WRITER_NOTE, mode);
        await db.insert(schema.drafts).values({ projectId, chapter: 3, body: 'the draft' });
        const feedbacks: string[] = [];

        await reviseService(feedbacks).reviseDraft(projectId, 3, { note: LEAKY_NOTE });

        const feedback = feedbacks[0] ?? '';
        expect(feedback).not.toContain('keeper_is_sister');
        expect(feedback).not.toContain(SECRET_TEXT);
        expect(feedback).not.toContain(AUTHOR_NOTE);
        expect(feedback).toContain('the lamp is never lit on-page');
        expect(feedback).toContain(`remove or avoid "sister" — ${WRITER_NOTE}`);
        expect(feedback).toContain(`cut anything that states or implies what the POV cast cannot know yet — ${WRITER_NOTE}`);

        const stored = await db.query.userFeedback.findFirst({ where: eq(schema.userFeedback.projectId, projectId) });
        expect(stored?.note).toBe(LEAKY_NOTE);
      });
    }

    it('should withhold the fact and its terms from the brief the reviser reads until the reveal chapter', async () => {
      const projectId = await seedProject(WRITER_NOTE, 'none');
      await db
        .update(schema.briefs)
        .set({ body: `The keeper will not say she is his sister. ${SECRET_TEXT}` })
        .where(eq(schema.briefs.projectId, projectId));
      await db.insert(schema.drafts).values([
        { projectId, chapter: 3, body: 'the draft' },
        { projectId, chapter: REVEAL_CHAPTER, body: 'the draft' },
      ]);
      const briefs: string[] = [];
      const service = reviseService([], briefs);

      await service.reviseDraft(projectId, 3, { note: 'tighten it' });
      await service.reviseDraft(projectId, REVEAL_CHAPTER, { note: 'tighten it' });

      expect(briefs[0]).toContain('The keeper will not say she is his [withheld]. [withheld]');
      expect(briefs[0]).not.toContain('sister');
      expect(briefs[1]).toContain(SECRET_TEXT);
    });

    it('should pass a note through untouched once the fact is revealed', async () => {
      const projectId = await seedProject(WRITER_NOTE, 'none');
      await db.insert(schema.drafts).values({ projectId, chapter: 11, body: 'the draft' });
      const feedbacks: string[] = [];

      await reviseService(feedbacks).reviseDraft(projectId, 11, { note: `Lean harder on the reveal: ${SECRET_TEXT}` });

      expect(feedbacks[0]).toBe(`Lean harder on the reveal: ${SECRET_TEXT}`);
    });

    it('should scrub earlier feedback notes in the revision pack', async () => {
      const projectId = await seedProject(WRITER_NOTE, 'none');
      await db.insert(schema.userFeedback).values({ projectId, artifactType: 'draft', artifactRef: 'draft:3', disposition: 'revision_requested', note: LEAKY_NOTE });

      const pack = await assembler.forRevision(projectId, 3, 0n);

      expect(pack.rendered).not.toContain('keeper_is_sister');
      expect(pack.rendered).not.toContain(SECRET_TEXT);
      expect(pack.rendered).not.toContain(AUTHOR_NOTE);
      expect(pack.rendered).toContain('the lamp is never lit on-page');
    });
  });

  describe('outliner-written refs', () => {
    function outlineService(requiredContext: string[]): GenerationService {
      const databaseService = { getPostgresClient: () => db } as never;
      const noop = {} as never;
      const brief = { chapter: 1, volumeKey: 'vol_1', title: 'Chapter 1', objective: 'objective', events: ['a beat'], requiredContext, endingContract: ENDING_CONTRACT };
      return new GenerationService(
        databaseService,
        noop,
        { structured: mock(async () => [brief]) } as never,
        new ContextAssembler(databaseService, new CatalogService(databaseService)),
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noop,
        noPluginPolicy(),
        noPluginProposals(),
      );
    }

    it('should strip fact refs from outlined briefs even though they resolve', async () => {
      const [project] = await db
        .insert(schema.projects)
        .values({ name: `spoiler-outline-${Date.now()}`, kind: 'new_novel' })
        .returning();
      if (!project) throw new Error('failed to seed project');
      const projectId = project.id;
      await db.insert(schema.volumes).values({ projectId, volumeKey: 'vol_1', ordinal: 1, status: 'approved', startChapter: 1, endChapter: 1, objective: 'survive' });
      await db.insert(schema.arcs).values({ projectId, arcKey: 'vol_1_arc_1', volumeKey: 'vol_1', ordinal: 1, chapterStart: 1, chapterEnd: 1, status: 'approved' });
      await db.insert(schema.entities).values({ projectId, entityKey: 'keeper', type: 'character', name: 'Keeper' });
      await db.insert(schema.canonFacts).values({ projectId, factKey: 'keeper_is_sister', text: SECRET_TEXT, revealChapter: REVEAL_CHAPTER });

      await outlineService(['entity:keeper', 'fact:keeper_is_sister', 'entity:ghost']).outlineArc(projectId, 'vol_1_arc_1', {});

      const brief = await db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, 1)) });
      expect(brief?.contextRefs).toEqual(['entity:keeper']);
    });
  });
});
