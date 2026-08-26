import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { AppError } from '@shadow-library/common';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { buildIdeationStressPrompt } from '@modules/ai/prompts';
import { IdeationService } from '@modules/ideation';
import { getQuestion } from '@modules/ideation/question-bank';
import { readinessDimensions, toRouterSeedState } from '@modules/ideation/question-router';
import { ActionExecutorRegistry } from '@modules/refinement/action-registry';
import { ChatCompactionService } from '@modules/refinement/chat-compaction.service';
import { ProposalApplyService } from '@modules/refinement/proposal-apply.service';
import { ProposalService } from '@modules/refinement/proposal.service';
import { seedContentHash } from '@server/common';
import { type Ideation, type PrimaryDatabase, type Refinement, schema } from '@server/database';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_ideation_turn`;

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

const ORIENTED = ['spark.idea', 'taste.comps', 'orient.shelf', 'orient.room', 'orient.length', 'orient.tone', 'orient.cast'];

const FULL_SHEET: Ideation.SeedFields = {
  genre: 'progression fantasy',
  premise: 'a salvager who can hear the dead ships she strips',
  hook: 'the first wreck she opens is still answering its captain',
  castShape: 'one lead',
  progressionSystem: 'the depth of wreck she can survive',
  protagonistDrive: 'buy back her brother’s indenture',
  stakes: 'every voice she keeps costs her a memory of her own',
  serializationNotes: '80 chapters, two a week',
  voice: 'first person, past, dry',
};

const cards = (marker: string) =>
  [1, 2, 3, 4].map(n => ({
    title: `${marker} ${n}`,
    logline: `${marker} logline ${n}`,
    engine: `engine ${n}`,
    ladder: `ladder ${n}`,
    posture: `posture ${n}`,
    hookLine: `hook ${n}`,
  }));

describe.if(pgAvailable)('IdeationService turn pipeline', () => {
  let db: PrimaryDatabase;
  let ideation: IdeationService;
  let proposals: ProposalService;
  let applier: ProposalApplyService;
  const structuredMock = mock<() => Promise<unknown>>(async () => ({ reply: 'stub' }));

  const lastInput = (): Record<string, string> => structuredMock.mock.calls.at(-1)?.[1 as never] as unknown as Record<string, string>;

  async function makeSeed(overrides: Partial<Ideation.StorySeed> = {}, sessionOverrides: Partial<Refinement.ChatSession> = {}) {
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `seed-${Date.now()}-${Math.random()}`, kind: 'new_novel', status: 'seed' })
      .returning();
    if (!project) throw new Error('failed to seed project');

    const [seed] = await db
      .insert(schema.storySeeds)
      .values({
        projectId: project.id,
        fields: overrides.fields ?? {},
        provenance: {},
        constraints: overrides.constraints ?? [],
        tasteAnchors: { comps: [], preferences: [] },
        concepts: overrides.concepts ?? [],
        readiness: [],
        askedQuestions: overrides.askedQuestions ?? [],
        contentHash: seedContentHash(overrides.fields ?? {}),
      })
      .returning();
    const [session] = await db
      .insert(schema.chatSessions)
      .values({ projectId: project.id, scopeType: 'ideation', mode: 'auto', title: 'Ideation Studio', ...sessionOverrides })
      .returning();
    if (!seed || !session) throw new Error('failed to seed studio');
    return { projectId: project.id, seedId: seed.id, sessionId: session.id };
  }

  const messages = (sessionId: string) => db.query.chatMessages.findMany({ where: eq(schema.chatMessages.sessionId, sessionId), orderBy: asc(schema.chatMessages.ordinal) });
  const sheet = (projectId: bigint) => db.query.storySeeds.findFirst({ where: eq(schema.storySeeds.projectId, projectId) });

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;

    const assembler = new ContextAssembler(databaseService, new CatalogService(databaseService));
    const workflowRuns = new WorkflowRunService(databaseService, noop, noop, noop, noop, noop);
    const modelRouter = { structured: structuredMock, resolveModel: () => ({ provider: 'openrouter', model: 'x-ai/grok-4.6' }) } as never;
    proposals = new ProposalService(databaseService);
    applier = new ProposalApplyService(databaseService, new ActionExecutorRegistry());
    const compaction = new ChatCompactionService(databaseService, modelRouter, workflowRuns);
    ideation = new IdeationService(databaseService, noop, noop, assembler, modelRouter, workflowRuns, proposals, applier, compaction);
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  describe('the interview turn', () => {
    it('persists the chip payload, records what was offered, and auto-applies the sheet edit', async () => {
      const { projectId, sessionId } = await makeSeed();
      const coaching = getQuestion('spark.idea')?.coaching as string;
      structuredMock.mockImplementationOnce(async () => ({
        reply: 'Heard: a salvager, and a debt.',
        payload: {
          kind: 'questions',
          questions: [{ id: 'spark.idea', wording: 'What is the idea?', coaching, options: ['a salvager', 'a courier'], youDecide: 'the salvager — the debt is already a plot' }],
        },
        changeSet: [{ op: 'seed.update', fields: { genre: 'progression fantasy' } }],
      }));

      const result = await ideation.turn(projectId, sessionId, 'a salvager who hears dead ships');

      expect(result.userMessage).toMatchObject({ ordinal: 1, role: 'user' });
      expect(result.assistantMessage).toMatchObject({ ordinal: 2, role: 'assistant', proposalId: result.proposal?.id });
      expect((result.assistantMessage.payload as { kind: string; questions: { id: string }[] }).kind).toBe('questions');
      expect((result.assistantMessage.payload as { questions: { id: string }[] }).questions[0]?.id).toBe('spark.idea');

      expect(result.proposal).toMatchObject({ status: 'applied', kind: 'ideation', scopeType: 'ideation', autoApplied: true });
      expect(result.applied?.applied).toEqual([{ artifactRef: 'seed', newRevision: 2 }]);
      expect(result.seed?.fields.genre).toBe('progression fantasy');

      const row = await sheet(projectId);
      expect(row?.fields?.genre).toBe('progression fantasy');
      expect(row?.askedQuestions).toEqual(['spark.idea']);

      const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
      expect(run).toMatchObject({ graph: 'ideation-turn', status: 'completed' });
      expect(run?.contextPackId).not.toBeNull();
      expect(lastInput()['volatileContext']).toContain('[spark.idea]');
    });

    it('reverts an auto-applied sheet edit back to the byte the turn started from', async () => {
      const { projectId, sessionId } = await makeSeed();
      structuredMock.mockImplementationOnce(async () => ({
        reply: 'Locking the shelf.',
        payload: { kind: 'questions', questions: [] },
        changeSet: [{ op: 'seed.update', fields: { genre: 'cosy mystery' } }],
      }));

      const result = await ideation.turn(projectId, sessionId, 'cosy mystery, please');
      expect((await sheet(projectId))?.fields?.genre).toBe('cosy mystery');

      await applier.revert(projectId, result.proposal?.id as bigint);
      expect((await sheet(projectId))?.fields?.genre).toBeUndefined();
    });

    it('records offered ids even when the author settled nothing', async () => {
      const { projectId, sessionId } = await makeSeed();
      structuredMock.mockImplementationOnce(async () => ({
        reply: 'No rush.',
        payload: { kind: 'questions', questions: [{ id: 'spark.idea', wording: 'w', coaching: 'c', options: ['a', 'b'], youDecide: 'a' }] },
      }));

      const result = await ideation.turn(projectId, sessionId, 'not sure yet');
      expect(result.proposal).toBeNull();
      expect((await sheet(projectId))?.askedQuestions).toEqual(['spark.idea']);
    });

    it('leaves a conflicted auto-apply pending with the reason on the turn', async () => {
      const { projectId, sessionId, seedId } = await makeSeed();
      const original = proposals.create.bind(proposals);
      (proposals as unknown as { create: typeof proposals.create }).create = async (...args) => {
        const proposal = await original(...args);
        // Someone else edited the sheet between staging and applying — the baseline no longer matches.
        await db.update(schema.storySeeds).set({ revision: 99 }).where(eq(schema.storySeeds.id, seedId));
        return proposal;
      };

      structuredMock.mockImplementationOnce(async () => ({
        reply: 'Shelf locked.',
        payload: { kind: 'questions', questions: [] },
        changeSet: [{ op: 'seed.update', fields: { genre: 'grimdark' } }],
      }));

      try {
        const result = await ideation.turn(projectId, sessionId, 'grimdark');
        expect(result.proposal?.status).toBe('conflicted');
        expect(result.applied).toBeUndefined();
        expect(result.applyNote).toBeTruthy();
        expect((await sheet(projectId))?.fields?.genre).toBeUndefined();
      } finally {
        (proposals as unknown as { create: typeof proposals.create }).create = original;
      }
    });

    it('compacts a long studio conversation before assembling the turn', async () => {
      const { projectId, sessionId } = await makeSeed();
      for (let i = 0; i < 7; i++) {
        structuredMock.mockImplementationOnce(async () => ({ reply: `reply ${i}`, payload: { kind: 'questions', questions: [] } }));
        await ideation.turn(projectId, sessionId, `message ${i}`);
      }

      structuredMock.mockImplementationOnce(async () => ({ summary: 'Decisions: salvager, dead ships. Open: the ladder.' }));
      structuredMock.mockImplementationOnce(async () => ({ reply: 'post-compaction', payload: { kind: 'questions', questions: [] } }));
      await ideation.turn(projectId, sessionId, 'one more');

      const session = await db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, sessionId) });
      expect(session?.summary).toContain('salvager');
      expect(session?.summaryThroughOrdinal).toBe(8);
      expect(await messages(sessionId)).toHaveLength(16);
    });
  });

  describe('guards', () => {
    it('refuses a project that is not a seed', async () => {
      const { projectId, sessionId } = await makeSeed();
      await db.update(schema.projects).set({ status: 'active' }).where(eq(schema.projects.id, projectId));

      expect(await codeOf(ideation.turn(projectId, sessionId, 'hello'))).toBe('IDE_001');
      expect(await codeOf(ideation.stress(projectId))).toBe('IDE_001');
    });

    it('refuses a session that is not the studio, is unknown, or is archived', async () => {
      const { projectId, sessionId } = await makeSeed();
      const [hub] = await db.insert(schema.chatSessions).values({ projectId, scopeType: 'project', mode: 'manual' }).returning();

      expect(await codeOf(ideation.turn(projectId, hub?.id as string, 'hello'))).toBe('IDE_005');
      expect(await codeOf(ideation.turn(projectId, '00000000-0000-0000-0000-000000000000', 'hello'))).toBe('CHT_001');

      await db.update(schema.chatSessions).set({ status: 'archived' }).where(eq(schema.chatSessions.id, sessionId));
      expect(await codeOf(ideation.turn(projectId, sessionId, 'hello'))).toBe('CHT_002');
    });

    it('refuses a session belonging to another project', async () => {
      const mine = await makeSeed();
      const theirs = await makeSeed();

      expect(await codeOf(ideation.turn(mine.projectId, theirs.sessionId, 'hello'))).toBe('CHT_001');
    });
  });

  describe('the concept round', () => {
    const dualLeads: Ideation.SeedConstraint[] = [{ key: 'leads', kind: 'shape', text: 'dual leads, both salvagers', lockedBy: 'author' }];

    it('persists four offered cards and asks nothing of the author yet', async () => {
      const { projectId, sessionId } = await makeSeed({ askedQuestions: ORIENTED });
      structuredMock.mockImplementationOnce(async () => ({ kind: 'cards', cards: cards('Wreck') }));

      const result = await ideation.turn(projectId, sessionId, 'show me options');

      const payload = result.assistantMessage.payload as { kind: string; round: number; filtersFailed?: unknown[] };
      expect(payload).toMatchObject({ kind: 'cards', round: 1 });
      expect(payload.filtersFailed).toBeUndefined();
      expect(result.assistantMessage.content).toBe(getQuestion('diverge.cards')?.coaching);

      const row = await sheet(projectId);
      expect(row?.concepts).toHaveLength(4);
      expect(row?.concepts?.every(card => card.fate === 'offered' && card.round === 1)).toBe(true);
      expect(row?.askedQuestions).toContain('diverge.cards');

      const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
      expect(run).toMatchObject({ graph: 'ideation-concepts', status: 'completed' });
    });

    it('numbers a second round above the first', async () => {
      const first = cards('Wreck').map(card => ({ ...card, round: 1, fate: 'killed' as const })) as unknown as Ideation.ConceptCard[];
      const { projectId, sessionId } = await makeSeed({ askedQuestions: ORIENTED.filter(id => id !== 'diverge.cards'), concepts: first });
      structuredMock.mockImplementationOnce(async () => ({ kind: 'cards', cards: cards('Tide') }));

      await ideation.turn(projectId, sessionId, 'again, different');
      const row = await sheet(projectId);
      expect(row?.concepts?.filter(card => card.round === 2)).toHaveLength(4);
    });

    it('re-generates once when a playbook filter rejects the set, and keeps the second set', async () => {
      const { projectId, sessionId } = await makeSeed({ askedQuestions: ORIENTED, constraints: dualLeads });
      structuredMock.mockImplementationOnce(async () => ({ kind: 'cards', cards: cards('Solo') }));
      structuredMock.mockImplementationOnce(async () => ({ kind: 'cards', cards: cards('Solo').map(card => ({ ...card, logline: `${card.logline}, both of them` })) }));
      const before = structuredMock.mock.calls.length;

      const result = await ideation.turn(projectId, sessionId, 'options please');

      expect(structuredMock.mock.calls.length - before).toBe(2);
      const payload = result.assistantMessage.payload as { filtersFailed?: unknown[] };
      expect(payload.filtersFailed).toBeUndefined();
      expect(lastInput()['volatileContext']).toContain('rejected against the locked shapes');
      expect((await sheet(projectId))?.concepts?.[0]?.logline).toContain('both of them');
    });

    it('shows the cards anyway when the filter still rejects them, with the failures named', async () => {
      const { projectId, sessionId } = await makeSeed({ askedQuestions: ORIENTED, constraints: dualLeads });
      structuredMock.mockImplementationOnce(async () => ({ kind: 'cards', cards: cards('Solo') }));
      structuredMock.mockImplementationOnce(async () => ({ kind: 'cards', cards: cards('Alone') }));
      const before = structuredMock.mock.calls.length;

      const result = await ideation.turn(projectId, sessionId, 'options please');

      // Exactly one retry: a filter that rejects everything must not spin.
      expect(structuredMock.mock.calls.length - before).toBe(2);

      const payload = result.assistantMessage.payload as { cards: unknown[]; filtersFailed: { playbookKey: string; card: string }[] };
      expect(payload.cards).toHaveLength(4);
      expect(payload.filtersFailed).toHaveLength(4);
      expect(payload.filtersFailed.every(failure => failure.playbookKey === 'dual-leads')).toBe(true);
      expect((await sheet(projectId))?.concepts).toHaveLength(4);
    });
  });

  describe('the stress pass', () => {
    const readiness = () =>
      readinessDimensions(
        toRouterSeedState({ fields: FULL_SHEET, constraints: [], tasteAnchors: { comps: [], preferences: [] }, concepts: [], readiness: [], askedQuestions: [] }),
      ).map(dimension => ({ dimension: dimension.dimension, verdict: 'thin' as const, note: 'note', fix: 'fix' }));

    const finished = () => makeSeed({ fields: FULL_SHEET, askedQuestions: [...ORIENTED, 'diverge.cards', ...QUESTION_IDS_DEEPEN] });

    it('runs when the router reaches it, persists the verdict, and records the offer', async () => {
      const { projectId, sessionId } = await finished();
      structuredMock.mockImplementationOnce(async () => ({ kind: 'readiness', readiness: readiness() }));

      const result = await ideation.turn(projectId, sessionId, 'am I ready?');

      expect((result.assistantMessage.payload as { kind: string }).kind).toBe('readiness');
      const row = await sheet(projectId);
      expect(row?.readiness).toHaveLength(7);
      expect(row?.askedQuestions).toContain('stress.readiness');
      expect(lastInput()['precheck']).toContain('hook: strong');

      const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
      expect(run).toMatchObject({ graph: 'ideation-stress', status: 'completed' });
    });

    it('runs on demand from the sheet screen', async () => {
      const { projectId } = await finished();
      structuredMock.mockImplementationOnce(async () => ({ kind: 'readiness', readiness: readiness() }));

      const result = await ideation.stress(projectId);
      expect(result.readiness).toHaveLength(7);
      expect(result.seed.readiness).toHaveLength(7);
      expect(result.runId).toBeTruthy();
    });

    it('sends a structurally empty dimension back rather than accepting a strong verdict for it', () => {
      const empty = readinessDimensions(
        toRouterSeedState({ fields: {}, constraints: [], tasteAnchors: { comps: [], preferences: [] }, concepts: [], readiness: [], askedQuestions: [] }),
      );
      const prompt = buildIdeationStressPrompt(empty);
      const report = readiness().map(entry => (entry.dimension === 'hook' ? { ...entry, verdict: 'strong' as const, fix: undefined } : entry));

      const errors = prompt.postValidate?.({ kind: 'readiness', readiness: report } as never) ?? [];
      expect(errors).toEqual(["the 'hook' dimension has no material on the sheet and cannot be strong"]);
    });
  });

  describe('the circling bound', () => {
    it('tells the turn to commit once the same question has been re-offered three times running', async () => {
      const { genre: _genre, ...withoutGenre } = FULL_SHEET;
      const { projectId, sessionId } = await makeSeed({ fields: withoutGenre, askedQuestions: [...ORIENTED, 'diverge.cards', ...QUESTION_IDS_DEEPEN] });

      const offer = { kind: 'questions', questions: [{ id: 'orient.shelf', wording: 'w', coaching: 'c', options: ['a', 'b'], youDecide: 'a' }] };
      for (const ordinal of [1, 2]) {
        await db.insert(schema.chatMessages).values({ sessionId, projectId, ordinal, role: 'assistant', content: 'asked before', payload: offer });
      }

      structuredMock.mockImplementationOnce(async () => ({ reply: 'Committing.', payload: offer }));
      await ideation.turn(projectId, sessionId, 'skip');

      expect(lastInput()['volatileContext']).toContain('COMMIT NOW');
      expect(lastInput()['volatileContext']).toContain('CIRCLING BACK');
    });

    it('says nothing about committing while the question is only on its second outing', async () => {
      const { genre: _genre, ...withoutGenre } = FULL_SHEET;
      const { projectId, sessionId } = await makeSeed({ fields: withoutGenre, askedQuestions: [...ORIENTED, 'diverge.cards', ...QUESTION_IDS_DEEPEN] });
      await db.insert(schema.chatMessages).values({
        sessionId,
        projectId,
        ordinal: 1,
        role: 'assistant',
        content: 'asked once',
        payload: { kind: 'questions', questions: [{ id: 'orient.shelf' }] },
      });

      structuredMock.mockImplementationOnce(async () => ({ reply: 'Asking again.', payload: { kind: 'questions', questions: [] } }));
      await ideation.turn(projectId, sessionId, 'skip');

      expect(lastInput()['volatileContext']).not.toContain('COMMIT NOW');
    });
  });
});

const QUESTION_IDS_DEEPEN = [
  'deepen.hook',
  'deepen.engine',
  'deepen.renewal',
  'deepen.want',
  'deepen.refusal',
  'deepen.cost',
  'deepen.foil',
  'deepen.promise',
  'deepen.voice',
  'deepen.secondLadder',
  'deepen.foreknowledgeDecay',
  'deepen.divergence',
  'deepen.stayingCost',
  'deepen.systemRules',
  'deepen.povBudget',
  'deepen.deferredTension',
  'deepen.ironyBudget',
];
