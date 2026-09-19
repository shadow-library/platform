import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { AppError } from '@shadow-library/common';

import { type ChatTurnEmitter } from '@modules/refinement/chat.service';
import { type ScopedTurnResult } from '@modules/refinement/chat-turn.registry';
import { type TurnStreamFrame, type TurnStreamListener, TurnStreamService } from '@modules/refinement/turn-stream.service';
import { AppErrorCode } from '@server/classes';
import { TestEnvironment } from '@tests/test-environment';
import { issueTestToken } from '@tests/test-idp';

const PROJECT_ID = 7n;
const OTHER_PROJECT_ID = 8n;
const RUN_ID = '11111111-1111-4111-8111-111111111111';

interface Harness {
  service: TurnStreamService;
  start: Promise<string>;
  emitter: ChatTurnEmitter;
  settle: (result: ScopedTurnResult) => void;
  fail: (err: unknown) => void;
}

function message(ordinal: number, role: string, content: string): ScopedTurnResult['userMessage'] {
  return {
    id: BigInt(ordinal),
    sessionId: 'session',
    ordinal,
    role,
    content,
    proposalId: null,
    payload: null,
    createdAt: new Date(0),
  } as unknown as ScopedTurnResult['userMessage'];
}

function turnResult(reply: string): ScopedTurnResult {
  return { userMessage: message(1, 'user', 'hello'), assistantMessage: message(2, 'assistant', reply), proposal: null, runId: RUN_ID };
}

function proposalRow(): NonNullable<ScopedTurnResult['proposal']> {
  return {
    id: 5n,
    projectId: PROJECT_ID,
    sessionId: 'session',
    messageId: 2n,
    scopeType: 'project',
    scopeRef: null,
    kind: 'hub',
    status: 'pending',
    summary: 'a summary',
    changeSet: [{ op: 'premise.update' }],
    baseline: {},
    autoApplied: false,
    inverseOps: [{ op: 'premise.update', premise: 'the previous premise' }],
    postState: { premise: 'the proposed premise' },
    opResults: null,
    model: 'x-ai/grok-4.6',
    runId: RUN_ID,
    appliedAt: null,
    revertedAt: null,
    error: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as NonNullable<ScopedTurnResult['proposal']>;
}

function harness(): Harness {
  let emitter!: ChatTurnEmitter;
  let settle!: (result: ScopedTurnResult) => void;
  let fail!: (err: unknown) => void;
  const chatService = {
    turn: (_projectId: bigint, _sessionId: string, _content: string, turnEmitter: ChatTurnEmitter) => {
      emitter = turnEmitter;
      return new Promise<ScopedTurnResult>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      });
    },
  };
  const service = new TurnStreamService(chatService as never);
  const start = service.start(PROJECT_ID, 'session', 'is chapter one landing its beat?');
  return { service, start, emitter, settle, fail };
}

function collector(): { frames: TurnStreamFrame[]; listener: TurnStreamListener; close: () => void } {
  const frames: TurnStreamFrame[] = [];
  let open = true;
  return {
    frames,
    listener: frame => {
      if (open) frames.push(frame);
      return open;
    },
    close: () => (open = false),
  };
}

const names = (frames: TurnStreamFrame[]): string[] => frames.map(frame => frame.event);
const text = (frames: TurnStreamFrame[]): string =>
  frames
    .filter(frame => frame.event === 'delta')
    .map(frame => (JSON.parse(frame.data) as { text: string }).text)
    .join('');

async function codeOf(run: () => unknown): Promise<string> {
  try {
    await run();
    return 'NO_ERROR';
  } catch (err) {
    return err instanceof AppError ? err.code : String(err);
  }
}

describe('TurnStreamService', () => {
  it('should answer with the run id long before the turn settles', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);

    expect(await turn.start).toBe(RUN_ID);
    expect(() => turn.service.assertRun(PROJECT_ID, RUN_ID)).not.toThrow();
  });

  it('should replay everything emitted before a subscriber connected', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    turn.emitter.onUserMessage(message(1, 'user', 'hello'));
    turn.emitter.onDelta('Chapter one ');
    turn.emitter.onDelta('lands late.');

    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    expect(names(client.frames)).toEqual(['reset', 'user', 'delta', 'delta']);
    expect(text(client.frames)).toBe('Chapter one lands late.');
  });

  it('should replay the whole backlog and the terminal event to a client connecting after the turn finished', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    turn.emitter.onDelta('Done already.');
    turn.settle(turnResult('Done already.'));
    await Bun.sleep(0);

    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    expect(names(client.frames)).toEqual(['reset', 'delta', 'done']);
    expect(JSON.parse(client.frames[2]?.data ?? '{}')).toMatchObject({ runId: RUN_ID, assistantMessage: { id: '2', content: 'Done already.' } });
  });

  it('should keep buffering and finish the turn after its only subscriber disconnects', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const gone = collector();
    const unsubscribe = turn.service.subscribe(PROJECT_ID, RUN_ID, gone.listener);
    gone.close();
    unsubscribe();

    turn.emitter.onDelta('Nobody is listening.');
    turn.settle(turnResult('Nobody is listening.'));
    await Bun.sleep(0);

    const late = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, late.listener);
    expect(names(late.frames)).toEqual(['reset', 'delta', 'done']);
    expect(text(late.frames)).toBe('Nobody is listening.');
  });

  it('should feed two clients on one run the same backlog and the same live events', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    turn.emitter.onDelta('Chapter one ');

    const first = collector();
    const second = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, first.listener);
    turn.service.subscribe(PROJECT_ID, RUN_ID, second.listener);
    turn.emitter.onDelta('lands late.');

    expect(text(first.frames)).toBe('Chapter one lands late.');
    expect(text(second.frames)).toBe('Chapter one lands late.');
  });

  it('should relay a lookup and a reset as they happen', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    turn.emitter.onLookup({ round: 0, tool: 'get_draft', args: { chapter: 1 }, status: 'running' });
    turn.emitter.onReset();

    expect(names(client.frames)).toEqual(['reset', 'lookup', 'reset']);
    expect(JSON.parse(client.frames[1]?.data ?? '{}')).toEqual({ round: 0, tool: 'get_draft', args: { chapter: 1 }, status: 'running' });
  });

  it('should refuse an unknown run and a run belonging to another project alike', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;

    expect(await codeOf(() => turn.service.assertRun(PROJECT_ID, '22222222-2222-4222-8222-222222222222'))).toBe(AppErrorCode.CHT_007.code);
    expect(await codeOf(() => turn.service.assertRun(OTHER_PROJECT_ID, RUN_ID))).toBe(AppErrorCode.CHT_007.code);
    expect(await codeOf(() => turn.service.subscribe(OTHER_PROJECT_ID, RUN_ID, collector().listener))).toBe(AppErrorCode.CHT_007.code);
  });

  it('should drop the buffer once the turn has ended and its stream has closed', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const client = collector();
    const unsubscribe = turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    turn.settle(turnResult('All done.'));
    await Bun.sleep(0);
    expect(names(client.frames)).toEqual(['reset', 'done']);
    expect(() => turn.service.assertRun(PROJECT_ID, RUN_ID)).not.toThrow();

    unsubscribe();

    expect(await codeOf(() => turn.service.assertRun(PROJECT_ID, RUN_ID))).toBe(AppErrorCode.CHT_007.code);
  });

  it('should keep a finished run readable when no client ever connected', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    turn.settle(turnResult('Nobody watched.'));
    await Bun.sleep(0);

    const late = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, late.listener);

    expect(names(late.frames)).toEqual(['reset', 'done']);
  });

  it('should surface a failed turn as an error event carrying its code and message', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    turn.fail(AppErrorCode.CHT_006.create());
    await Bun.sleep(0);

    expect(names(client.frames)).toEqual(['reset', 'error']);
    expect(JSON.parse(client.frames[1]?.data ?? '{}')).toEqual({ code: 'CHT_006', message: AppErrorCode.CHT_006.message });
  });

  it('should mask an unexpected failure behind the generic error code', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    turn.fail(new Error('postgres went away'));
    await Bun.sleep(0);

    expect(JSON.parse(client.frames[1]?.data ?? '{}')).toEqual({ code: 'UNKNOWN', message: 'Unknown Error' });
  });

  it('should reject the start call when the turn fails before its run exists', async () => {
    const turn = harness();

    turn.fail(AppErrorCode.CHT_002.create());

    expect(await codeOf(() => turn.start)).toBe('CHT_002');
  });

  it('should drop the replay backlog rather than replay a hole once the cap is passed', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    turn.emitter.onDelta('the opening the client will never see');
    for (let chunk = 0; chunk < 9; chunk++) turn.emitter.onDelta('x'.repeat(64 * 1024));

    const late = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, late.listener);
    turn.emitter.onDelta('and the tail it will.');

    expect(names(late.frames)).toEqual(['reset', 'delta']);
    expect(text(late.frames)).toBe('and the tail it will.');
  });

  it('should carry only the fields the response contract declares', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);
    turn.emitter.onUserMessage(message(1, 'user', 'hello'));

    turn.settle({ ...turnResult('Settled.'), proposal: proposalRow() });
    await Bun.sleep(0);

    const user = JSON.parse(client.frames[1]?.data ?? '{}') as Record<string, unknown>;
    expect(Object.keys(user).sort()).toEqual(['content', 'createdAt', 'id', 'modelId', 'modelProvider', 'ordinal', 'proposalId', 'role', 'runId', 'sessionId']);

    const done = JSON.parse(client.frames[2]?.data ?? '{}') as { proposal: Record<string, unknown> };
    expect(Object.keys(done).sort()).toEqual(['assistantMessage', 'proposal', 'runId', 'userMessage']);
    // The rollback payload the contract reduces to `revertible`, and the columns it never declared at all.
    expect(done.proposal).not.toHaveProperty('inverseOps');
    expect(done.proposal).not.toHaveProperty('postState');
    expect(done.proposal).not.toHaveProperty('tokens');
    expect(done.proposal['revertible']).toBe(false);
  });

  it('should answer the start call from the result when the run id never reached it', async () => {
    const turn = harness();

    turn.settle(turnResult('The emitter was deaf but the turn was not.'));

    expect(await turn.start).toBe(RUN_ID);
  });

  it('should hold a finished run open until the second of two replayed clients has gone', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    turn.settle(turnResult('Both of you get this.'));
    await Bun.sleep(0);

    const first = collector();
    const second = collector();
    const leaveFirst = turn.service.subscribe(PROJECT_ID, RUN_ID, first.listener);
    const leaveSecond = turn.service.subscribe(PROJECT_ID, RUN_ID, second.listener);
    leaveFirst();

    expect(names(second.frames)).toEqual(['reset', 'done']);
    expect(() => turn.service.assertRun(PROJECT_ID, RUN_ID)).not.toThrow();

    leaveSecond();

    expect(await codeOf(() => turn.service.assertRun(PROJECT_ID, RUN_ID))).toBe(AppErrorCode.CHT_007.code);
  });

  it('should drop a subscriber that throws without blinding the others', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const healthy = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, () => {
      throw new Error('socket write failed');
    });
    turn.service.subscribe(PROJECT_ID, RUN_ID, healthy.listener);

    turn.emitter.onDelta('still delivered');
    turn.settle(turnResult('still delivered'));
    await Bun.sleep(0);

    expect(names(healthy.frames)).toEqual(['reset', 'delta', 'done']);
  });

  it('should ignore an event emitted after the turn has ended', async () => {
    const turn = harness();
    turn.emitter.onRunId(RUN_ID);
    await turn.start;
    const client = collector();
    turn.service.subscribe(PROJECT_ID, RUN_ID, client.listener);

    turn.settle(turnResult('Settled.'));
    await Bun.sleep(0);
    turn.emitter.onDelta('too late');

    expect(names(client.frames)).toEqual(['reset', 'done']);
  });
});

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

const testEnv = new TestEnvironment('turn_stream');

describe.if(pgAvailable)('GET /api/v1/projects/:projectId/turns/:runId/stream', () => {
  testEnv.init();

  async function createProject(): Promise<string> {
    const response = await testEnv
      .getRouter()
      .mockRequest()
      .post('/api/v1/projects')
      .body({ name: `turn-stream-${crypto.randomUUID()}`, kind: 'new_novel' });
    return response.json().id as string;
  }

  /** Buffers a run against `projectId` without a model call: the turn reports its run id and then never settles. */
  async function buffer(projectId: string): Promise<string> {
    const service = testEnv.getService(TurnStreamService);
    const runId = crypto.randomUUID();
    const chatService = {
      turn: (_projectId: bigint, _sessionId: string, _content: string, emitter?: ChatTurnEmitter) => {
        emitter?.onRunId(runId);
        return new Promise<never>(() => undefined);
      },
    };
    (service as unknown as { chatService: unknown }).chatService = chatService;
    return service.start(BigInt(projectId), 'session', 'what should the opening beat be?');
  }

  // The run is resolved before the route hijacks its response, so these are JSON 404s and not 200s that stream nothing.
  it('should answer 404 for a run it is not buffering', async () => {
    const projectId = await createProject();

    const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${projectId}/turns/${RUN_ID}/stream`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CHT_007' });
  });

  it('should answer 404 for a run belonging to another of the caller’s projects', async () => {
    const [mine, other] = await Promise.all([createProject(), createProject()]);
    const runId = await buffer(mine);

    const response = await testEnv.getRouter().mockRequest().get(`/api/v1/projects/${other}/turns/${runId}/stream`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CHT_007' });
  });

  it('should answer 404 to a caller who does not own the project the run belongs to', async () => {
    const projectId = await createProject();
    const runId = await buffer(projectId);
    const token = await issueTestToken({ sub: '99' });

    const response = await testEnv
      .getRouter({ authenticated: false })
      .mockRequest()
      .get(`/api/v1/projects/${projectId}/turns/${runId}/stream`)
      .headers({ authorization: `Bearer ${token}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'PRJ_001' });
  });
});
