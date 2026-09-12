import { SQL } from 'bun';
import { beforeAll, describe, expect, it } from 'bun:test';

import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { ProjectEventService } from '@modules/events';
import { JobService } from '@modules/jobs/job.service';
import { TestEnvironment } from '@tests/test-environment';
import { issueTestToken } from '@tests/test-idp';

interface EventFrame {
  event: string;
  data: Record<string, unknown>;
}

interface Subscription {
  status: number;
  next: (matches?: (frame: EventFrame) => boolean) => Promise<EventFrame>;
  close: () => void;
}

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const testEnv = new TestEnvironment('project_events');

describe.if(pgAvailable)('GET /api/v1/projects/:projectId/events', () => {
  testEnv.init();
  let baseUrl = '';
  let token = '';

  beforeAll(async () => {
    token = await issueTestToken();
    const instance = testEnv.getRouter({ authenticated: false }).getInstance();
    await instance.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = `http://127.0.0.1:${(instance.server.address() as { port: number }).port}`;
  });

  async function createProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `events-${crypto.randomUUID()}`, kind: 'new_novel' });
    return response.json().id;
  }

  async function subscribe(projectId: string, bearer = token): Promise<Subscription> {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/events`, { headers: { authorization: `Bearer ${bearer}` }, signal: controller.signal });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const frames: EventFrame[] = [];
    let buffer = '';

    const next = async (matches: (frame: EventFrame) => boolean = () => true): Promise<EventFrame> => {
      const deadline = Date.now() + 3_000;
      for (;;) {
        const index = frames.findIndex(matches);
        if (index !== -1) return frames.splice(index, 1)[0] as EventFrame;
        if (!reader || Date.now() > deadline) throw new Error(`no matching event; buffered: ${JSON.stringify(frames)}`);
        const chunk = await Promise.race([reader.read(), Bun.sleep(deadline - Date.now()).then(() => null)]);
        if (!chunk || chunk.done) continue;
        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) frames.push({ event, data: JSON.parse(data) });
        }
      }
    };

    return { status: response.status, next, close: () => controller.abort() };
  }

  it('should open with a ready event', async () => {
    const stream = await subscribe(await createProject());

    expect(stream.status).toBe(200);
    expect((await stream.next()).event).toBe('ready');
    stream.close();
  });

  it('should stream a run from running to completed', async () => {
    const projectId = await createProject();
    const stream = await subscribe(projectId);
    await stream.next(frame => frame.event === 'ready');

    const { runId } = await testEnv.getService(WorkflowRunService).runChain(BigInt(projectId), 'chat-turn', 'session:s1', {}, async () => 'done');

    expect((await stream.next()).data).toEqual({ type: 'run', runId, graph: 'chat-turn', target: 'session:s1', status: 'running' });
    expect((await stream.next()).data).toEqual({ type: 'run', runId, graph: 'chat-turn', target: 'session:s1', status: 'completed' });
    stream.close();
  });

  it('should stream a run that fails as failed', async () => {
    const projectId = await createProject();
    const stream = await subscribe(projectId);
    await stream.next(frame => frame.event === 'ready');

    await testEnv
      .getService(WorkflowRunService)
      .runChain(BigInt(projectId), 'ideation-turn', 'session:s2', {}, async () => {
        throw new Error('model unreachable');
      })
      .catch(() => undefined);

    await stream.next(frame => frame.data['status'] === 'running');
    expect((await stream.next()).data).toMatchObject({ type: 'run', target: 'session:s2', status: 'failed' });
    stream.close();
  });

  it('should stream a job as it is enqueued and claimed', async () => {
    const projectId = await createProject();
    const stream = await subscribe(projectId);
    await stream.next(frame => frame.event === 'ready');
    const jobs = testEnv.getService(JobService);

    const jobId = await jobs.enqueue(BigInt(projectId), 'extract', 'all');
    await jobs.start(jobId);

    expect((await stream.next()).data).toEqual({ type: 'job', jobId, kind: 'extract', status: 'pending' });
    expect((await stream.next()).data).toEqual({ type: 'job', jobId, kind: 'extract', status: 'in_progress' });
    stream.close();
  });

  it('should not deliver another project’s events', async () => {
    const [mine, theirs] = await Promise.all([createProject(), createProject()]);
    const stream = await subscribe(mine);
    await stream.next(frame => frame.event === 'ready');
    const events = testEnv.getService(ProjectEventService);

    events.publish(BigInt(theirs), { type: 'chat', sessionId: 'theirs' });
    events.publish(BigInt(mine), { type: 'chat', sessionId: 'mine' });

    expect((await stream.next()).data).toEqual({ type: 'chat', sessionId: 'mine' });
    stream.close();
  });

  it('should refuse to stream a project the caller does not own', async () => {
    const projectId = await createProject();

    const stream = await subscribe(projectId, await issueTestToken({ sub: '99' }));

    expect(stream.status).toBe(404);
    stream.close();
  });

  it('should drop the subscription once the client disconnects', async () => {
    const projectId = await createProject();
    const stream = await subscribe(projectId);
    await stream.next(frame => frame.event === 'ready');
    const listeners = (testEnv.getService(ProjectEventService) as unknown as { listeners: Map<bigint, Set<unknown>> }).listeners;
    expect(listeners.get(BigInt(projectId))?.size).toBe(1);

    stream.close();
    for (let wait = 0; wait < 50 && listeners.has(BigInt(projectId)); wait++) await Bun.sleep(10);

    expect(listeners.has(BigInt(projectId))).toBe(false);
  });
});
