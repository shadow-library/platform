import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import { ProjectEventService } from '@modules/events';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { PROMPT_REGISTRY } from '@modules/ai/prompts';
import { type PromptModule } from '@modules/ai/prompts/types';
import { IdeaNameSchema } from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';
import { type TelemetryContext } from '@modules/ai/telemetry.handler';
import { IDEA_NAME_SOURCE_LIMIT, IdeaNamingService, normaliseIdeaName } from '@modules/ideation';
import { type ProjectEvent } from '@modules/events/project-events.types';
import { seedContentHash } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';
import { runCancellationStub } from '@tests/fixtures/model-router';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_idea_naming`;

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

type Structured = (prompt: PromptModule<never>, input: Record<string, string>, ctx: TelemetryContext) => Promise<unknown>;

interface Deferred {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('condition never held');
}

describe('normaliseIdeaName', () => {
  it('should trim and collapse whitespace', () => {
    expect(normaliseIdeaName('  The   Villain Who\nWon’t Fall  ')).toBe('The Villain Who Won’t Fall');
  });

  it('should strip wrapping quotes of every kind, nested or not', () => {
    expect(normaliseIdeaName('"The Wreck Singer"')).toBe('The Wreck Singer');
    expect(normaliseIdeaName('“‘The Wreck Singer’”')).toBe('The Wreck Singer');
    expect(normaliseIdeaName("'The Wreck Singer.'")).toBe('The Wreck Singer');
    expect(normaliseIdeaName('"The Wreck Singer".')).toBe('The Wreck Singer');
    expect(normaliseIdeaName("'The Villain's Due'")).toBe("The Villain's Due");
    expect(normaliseIdeaName("'The Twins' Debt'")).toBe("The Twins' Debt");
  });

  it('should keep quotes and apostrophes that do not wrap the whole name', () => {
    expect(normaliseIdeaName('The "Lucky" Protagonist')).toBe('The "Lucky" Protagonist');
    expect(normaliseIdeaName("The Twins' Debt")).toBe("The Twins' Debt");
    expect(normaliseIdeaName('"Foo" and "Bar"')).toBe('"Foo" and "Bar"');
    expect(normaliseIdeaName('“Foo” and “Bar”')).toBe('“Foo” and “Bar”');
  });

  it('should drop trailing punctuation but keep a question or exclamation mark', () => {
    expect(normaliseIdeaName('The Wreck Singer...')).toBe('The Wreck Singer');
    expect(normaliseIdeaName('Who Stole the Sun?')).toBe('Who Stole the Sun?');
  });

  it('should cap a long name at 60 characters on a word boundary', () => {
    const name = normaliseIdeaName('The Salvager Who Could Hear Every Dead Ship Singing Beneath the Frozen Harbour');

    expect(name).toBe('The Salvager Who Could Hear Every Dead Ship Singing Beneath');
    expect(name?.length).toBeLessThanOrEqual(60);
  });

  it('should hard-cut a single word longer than the cap', () => {
    expect(normaliseIdeaName('x'.repeat(80))).toBe('x'.repeat(60));
  });

  it('should return null for an answer with nothing left after normalising', () => {
    expect(normaliseIdeaName('')).toBeNull();
    expect(normaliseIdeaName('   ')).toBeNull();
    expect(normaliseIdeaName('""')).toBeNull();
    expect(normaliseIdeaName('“ . ”')).toBeNull();
  });
});

describe('idea-name prompt', () => {
  it('should route through the cheap title role as an analytical prompt', () => {
    const prompt = PROMPT_REGISTRY['idea-name'];

    expect(prompt).toMatchObject({ key: 'idea-name', version: '1.0.0', kind: 'analytical', role: 'title' });
  });

  it('should render the idea into the human message', async () => {
    const messages = await PROMPT_REGISTRY['idea-name'].template.formatMessages({ idea: 'a villain gets a system that tells him to ruin the hero’s luck {verbatim}' });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.getType()).toBe('system');
    expect(String(messages[1]?.content)).toContain('a villain gets a system that tells him to ruin the hero’s luck {verbatim}');
  });

  it('should accept a name of 1 to 60 characters and nothing else', () => {
    expect(parseSchema(IdeaNameSchema, { name: 'The Villain Who Won’t Fall for Them' }).success).toBe(true);
    expect(parseSchema(IdeaNameSchema, { name: '' }).success).toBe(false);
    expect(parseSchema(IdeaNameSchema, { name: 'x'.repeat(61) }).success).toBe(false);
    expect(parseSchema(IdeaNameSchema, {}).success).toBe(false);
  });
});

describe.if(pgAvailable)('IdeaNamingService', () => {
  let db: PrimaryDatabase;
  let naming: IdeaNamingService;
  const events = new ProjectEventService();
  const structured = mock<Structured>(async () => ({ name: 'The Wreck Singer' }));

  async function makeSeed(spark?: string) {
    const [project] = await db.insert(schema.projects).values({ name: 'Untitled idea', kind: 'new_novel', status: 'seed' }).returning();
    if (!project) throw new Error('failed to seed project');
    const [seed] = await db
      .insert(schema.storySeeds)
      .values({ projectId: project.id, contentHash: seedContentHash({}) })
      .returning();
    const [session] = await db.insert(schema.chatSessions).values({ projectId: project.id, scopeType: 'ideation', mode: 'auto', title: 'Ideation Studio' }).returning();
    if (!seed || !session) throw new Error('failed to seed studio');
    if (spark) await db.insert(schema.chatMessages).values({ sessionId: session.id, projectId: project.id, ordinal: 1, role: 'user', content: spark });
    return { projectId: project.id, seedId: seed.id, sessionId: session.id };
  }

  const titleOf = async (projectId: bigint) => (await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { title: true } }))?.title;
  const runsOf = (projectId: bigint) => db.query.workflowRuns.findMany({ where: eq(schema.workflowRuns.projectId, projectId) });
  const request = (seed: { projectId: bigint; seedId: bigint; sessionId: string }, fallback = 'the latest message') => ({ ...seed, fallback });

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    const databaseService = { getPostgresClient: () => db } as never;
    const noop = {} as never;
    const workflowRuns = new WorkflowRunService(databaseService, noop, runCancellationStub() as never, noop, noop, noop, noop, events);
    naming = new IdeaNamingService(databaseService, { structured } as never, workflowRuns);
  });

  beforeEach(() => {
    structured.mockReset();
    structured.mockImplementation(async () => ({ name: 'The Wreck Singer' }));
  });

  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should write the name when the idea has none, under an audited ideation-name run', async () => {
    const seed = await makeSeed('a salvager who can hear the dead ships she strips');
    const heard: ProjectEvent[] = [];
    const unsubscribe = events.subscribe(seed.projectId, event => heard.push(event));
    structured.mockImplementation(async () => ({ name: '  "The Wreck  Singer."  ' }));

    try {
      expect(await naming.nameIdea(request(seed))).toBe('The Wreck Singer');
    } finally {
      unsubscribe();
    }

    expect(await titleOf(seed.projectId)).toBe('The Wreck Singer');
    const [prompt, input, telemetry] = structured.mock.calls[0] ?? [];
    expect(prompt?.key).toBe('idea-name');
    expect(input).toEqual({ idea: 'a salvager who can hear the dead ships she strips' });

    const runs = await runsOf(seed.projectId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ graph: 'ideation-name', target: `seed:${seed.seedId}`, status: 'completed' });
    expect(telemetry).toMatchObject({ projectId: seed.projectId, runId: runs[0]?.id, node: 'ideation-name', promptKey: 'idea-name', promptVersion: '1.0.0', role: 'title' });
    expect(heard.map(event => (event.type === 'run' ? event.status : event.type))).toEqual(['running', 'completed']);
  });

  it('should name from the first author message and fall back to the given text when there is none', async () => {
    const withSpark = await makeSeed('the spark itself');
    await db.insert(schema.chatMessages).values({ sessionId: withSpark.sessionId, projectId: withSpark.projectId, ordinal: 2, role: 'assistant', content: 'a reply' });
    await db.insert(schema.chatMessages).values({ sessionId: withSpark.sessionId, projectId: withSpark.projectId, ordinal: 3, role: 'user', content: 'a later answer' });
    await naming.nameIdea(request(withSpark));
    expect(structured.mock.calls.at(-1)?.[1]).toEqual({ idea: 'the spark itself' });

    const withoutSpark = await makeSeed();
    await naming.nameIdea(request(withoutSpark, '  the first turn’s content  '));
    expect(structured.mock.calls.at(-1)?.[1]).toEqual({ idea: 'the first turn’s content' });
  });

  it('should cap the idea handed to the model', async () => {
    const seed = await makeSeed('x'.repeat(IDEA_NAME_SOURCE_LIMIT + 500));

    await naming.nameIdea(request(seed));

    expect(structured.mock.calls[0]?.[1]['idea']).toHaveLength(IDEA_NAME_SOURCE_LIMIT);
  });

  it('should not call the model for an idea that already has a name', async () => {
    const seed = await makeSeed('a spark');
    await db.update(schema.projects).set({ title: 'Mine' }).where(eq(schema.projects.id, seed.projectId));

    expect(await naming.nameIdea(request(seed))).toBeNull();

    expect(structured).not.toHaveBeenCalled();
    expect(await runsOf(seed.projectId)).toHaveLength(0);
    expect(await titleOf(seed.projectId)).toBe('Mine');
  });

  it('should never overwrite a rename that lands while the model is answering', async () => {
    const seed = await makeSeed('a spark');
    const answer = deferred();
    structured.mockImplementation(() => answer.promise);

    const naming$ = naming.nameIdea(request(seed));
    await until(() => structured.mock.calls.length === 1);
    await db.update(schema.projects).set({ title: 'The Author’s Choice' }).where(eq(schema.projects.id, seed.projectId));
    answer.resolve({ name: 'The Model’s Choice' });

    expect(await naming$).toBeNull();
    expect(await titleOf(seed.projectId)).toBe('The Author’s Choice');
  });

  it('should write nothing for an idea graduated or deleted while the model is answering', async () => {
    const graduated = await makeSeed('a spark');
    const deleted = await makeSeed('another spark');
    const answer = deferred();
    structured.mockImplementation(() => answer.promise);

    const naming$ = [naming.nameIdea(request(graduated)), naming.nameIdea(request(deleted))];
    await until(() => structured.mock.calls.length === 2);
    await db.update(schema.projects).set({ status: 'active' }).where(eq(schema.projects.id, graduated.projectId));
    await db.delete(schema.projects).where(eq(schema.projects.id, deleted.projectId));
    answer.resolve({ name: 'Too Late' });

    expect(await Promise.all(naming$)).toEqual([null, null]);
    expect(await titleOf(graduated.projectId)).toBeNull();
  });

  it('should skip an idea that is no longer a seed or no longer exists', async () => {
    const graduated = await makeSeed('a spark');
    await db.update(schema.projects).set({ status: 'active' }).where(eq(schema.projects.id, graduated.projectId));

    expect(await naming.nameIdea(request(graduated))).toBeNull();
    expect(await naming.nameIdea({ projectId: 999_999_999n, seedId: 1n, sessionId: graduated.sessionId, fallback: 'x' })).toBeNull();
    expect(structured).not.toHaveBeenCalled();
  });

  it('should leave the title null for an answer that normalises to nothing', async () => {
    const seed = await makeSeed('a spark');
    structured.mockImplementation(async () => ({ name: '""' }));

    expect(await naming.nameIdea(request(seed))).toBeNull();

    expect(await titleOf(seed.projectId)).toBeNull();
    expect((await runsOf(seed.projectId))[0]?.status).toBe('completed');
  });

  it('should leave the title null, fail the run and resolve rather than throw when the model fails', async () => {
    const seed = await makeSeed('a spark');
    structured.mockImplementation(async () => {
      throw new Error('provider down');
    });

    expect(await naming.nameIdea(request(seed))).toBeNull();

    expect(await titleOf(seed.projectId)).toBeNull();
    const [run] = await runsOf(seed.projectId);
    expect(run).toMatchObject({ graph: 'ideation-name', status: 'failed' });
    expect(run?.error).toMatchObject({ message: 'provider down' });
  });

  describe('nameInBackground', () => {
    it('should return before the model answers', async () => {
      const seed = await makeSeed('a spark');
      const answer = deferred();
      structured.mockImplementation(() => answer.promise);

      expect(naming.nameInBackground(request(seed))).toBeUndefined();
      await until(() => structured.mock.calls.length === 1);
      expect(await titleOf(seed.projectId)).toBeNull();

      answer.resolve({ name: 'Eventually' });
      await until(async () => (await titleOf(seed.projectId)) === 'Eventually');
    });

    it('should start no second run while one is in flight, and release the guard once it settles', async () => {
      const seed = await makeSeed('a spark');
      const answer = deferred();
      structured.mockImplementation(() => answer.promise);

      naming.nameInBackground(request(seed));
      await until(() => structured.mock.calls.length === 1);
      naming.nameInBackground(request(seed));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(structured).toHaveBeenCalledTimes(1);
      expect(await runsOf(seed.projectId)).toHaveLength(1);

      answer.reject(new Error('provider down'));
      await until(async () => (await runsOf(seed.projectId))[0]?.status === 'failed');

      structured.mockImplementation(async () => ({ name: 'Second Time Lucky' }));
      naming.nameInBackground(request(seed));
      await until(async () => (await titleOf(seed.projectId)) === 'Second Time Lucky');
      expect(await runsOf(seed.projectId)).toHaveLength(2);
    });

    it('should never surface a failure to the caller', async () => {
      const seed = await makeSeed('a spark');
      structured.mockImplementation(async () => {
        throw new Error('provider down');
      });

      expect(() => naming.nameInBackground(request(seed))).not.toThrow();
      await until(async () => (await runsOf(seed.projectId))[0]?.status === 'failed');
      expect(await titleOf(seed.projectId)).toBeNull();
    });
  });
});
