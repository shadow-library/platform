import { describe, expect, it } from 'bun:test';
import { type HttpResponse } from '@shadow-library/fastify';

import { type Refinement } from '@server/database';

import { type ActorService, type AdminAccessService } from '@modules/actor';
import { AiController } from '@modules/ai/ai.controller';
import { type AiUsageService } from '@modules/ai/ai-usage.service';
import { ModelCatalogService } from '@modules/ai/model-catalog.service';
import { type WriterSnapshotService } from '@modules/ai/writer-snapshot.service';
import { GenerationController } from '@modules/generation/generation.controller';
import { type RunUsageDetailResponse } from '@modules/generation/run-inspection.dto';
import { type RunInspectionService } from '@modules/generation/run-inspection.service';
import { WriterSnapshotController } from '@modules/generation/writer-snapshot.controller';
import { ProjectController } from '@modules/project/project/project.controller';
import { summarizeCost } from '@modules/project/project/project-cost';
import { type ProjectService } from '@modules/project/project/project.service';
import { ChatController } from '@modules/refinement/chat.controller';
import { type ChatSessionService } from '@modules/refinement/chat-session.service';
import { type ChatService, type ChatTurnResult } from '@modules/refinement/chat.service';
import { serialiseProposal } from '@modules/refinement/serialise';
import { type TurnCostService } from '@modules/refinement/turn-cost.service';
import { TurnStreamController } from '@modules/refinement/turn-stream.controller';
import { frameWithoutModel, type TurnStreamService } from '@modules/refinement/turn-stream.service';
import { type TurnStreamFrame, type TurnStreamListener } from '@modules/refinement/turn-stream.types';
import { ChapterReviewController } from '@modules/review/chapter-review.controller';
import { type ChapterReviewRecordResponse } from '@modules/review/chapter-review.dto';
import { type ChapterReviewService } from '@modules/review/chapter-review.service';

const MODEL_ID = 'anthropic/claude-sonnet-5';

function viewer(admin: boolean): AdminAccessService {
  return { canSeeModels: async () => admin } as unknown as AdminAccessService;
}

const VIEWERS = [
  { who: 'an admin', admin: true },
  { who: 'an author', admin: false },
] as const;

describe('GET /ai/models', () => {
  it('should offer an author the paces by key and whether Unrestricted is available, and nothing else', async () => {
    const catalog = { unrestrictedAvailable: async () => true, modelsResponse: () => Promise.reject(new Error('the author shape never reads the catalog models')) };
    const service = new ModelCatalogService({ getPostgresClient: () => ({}) } as never, catalog as never);

    expect(await service.authorOptions()).toEqual({ paces: ['economy', 'balanced', 'performant'], unrestrictedAvailable: true });
  });
});

describe('usage byModel', () => {
  const cost = { ...summarizeCost([]), byModel: [{ key: MODEL_ID, label: 'Sonnet', calls: 1, inputTokens: 1, outputTokens: 1, costUsd: 0.5, estimatedCostUsd: 0 }] };

  for (const { who, admin } of VIEWERS) {
    it(`should ${admin ? 'show' : 'hide'} the per-model breakdown of a project's cost for ${who}, keeping its spend`, async () => {
      const projects = { cost: async () => cost } as unknown as ProjectService;

      const result = await new ProjectController(projects, viewer(admin)).getProjectCost({ projectId: 1n });

      expect(result.byModel).toHaveLength(admin ? 1 : 0);
      expect(result.totalCostUsd).toBe(cost.totalCostUsd);
    });

    it(`should ${admin ? 'show' : 'hide'} the per-model breakdown of account usage for ${who}`, async () => {
      const actor = { current: () => ({ kind: 'user', id: 1n, organisationId: null }) } as unknown as ActorService;
      const usage = { usage: async () => ({ ...cost, byProject: [] }) } as unknown as AiUsageService;

      const result = await new AiController(actor, viewer(admin), usage, {} as never, {} as never).usage();

      expect(result.byModel).toHaveLength(admin ? 1 : 0);
    });
  }
});

describe('GET /runs/:runId/usage', () => {
  const call = {
    id: 1n,
    role: 'generation',
    provider: 'synapse',
    model: MODEL_ID,
    reasoningEffort: 'xhigh',
    inputTokens: 40,
    outputTokens: 20,
    chargeUsd: 0.25,
    estimatedChargeUsd: 0,
  };
  const usage = { id: 'run-1', totals: {}, calls: [call] } as unknown as RunUsageDetailResponse;

  for (const { who, admin } of VIEWERS) {
    it(`should ${admin ? 'name' : 'not name'} the model, provider and reasoning effort of each call for ${who}, keeping its tokens and charge`, async () => {
      const runs = { getRunUsage: async () => usage } as unknown as RunInspectionService;

      const [result] = (await new GenerationController({} as never, {} as never, runs, viewer(admin)).getRunUsage({ projectId: 1n, runId: 'run-1' })).calls;

      expect(result?.model).toBe(admin ? MODEL_ID : undefined);
      expect(result && 'model' in result && 'provider' in result && 'reasoningEffort' in result).toBe(admin);
      expect(result).toMatchObject({ inputTokens: 40, outputTokens: 20, chargeUsd: 0.25 });
    });
  }
});

describe('writer snapshots', () => {
  const snapshot = { id: 1n, chapter: 1, modelRoute: { provider: 'synapse', model: MODEL_ID }, messages: [] };
  const snapshots = { list: async () => [snapshot], get: async () => snapshot } as unknown as WriterSnapshotService;

  for (const { who, admin } of VIEWERS) {
    it(`should ${admin ? 'carry' : 'omit'} the model route for ${who}`, async () => {
      const controller = new WriterSnapshotController(snapshots, viewer(admin));

      const [listed] = (await controller.list({ projectId: 1n, n: 1 })).items;
      const detail = await controller.get({ projectId: 1n, n: 1, snapshotId: 1n });

      for (const view of [listed, detail]) expect(view && 'modelRoute' in view).toBe(admin);
    });
  }
});

describe('chapter reviews', () => {
  const review = { id: 1n, kind: 'judge', modelProvider: 'synapse', model: MODEL_ID, costTier: 'balanced' } as unknown as ChapterReviewRecordResponse;
  const reviews = {
    list: async () => ({ chapter: 1, latest: [review], history: [review] }),
    get: async () => review,
    start: async () => ({ queued: false, review }),
    remedy: async () => review,
    clearRemedy: async () => review,
  } as unknown as ChapterReviewService;
  const params = { projectId: 1n, n: 1, reviewId: 1n, findingId: 'f1' };

  for (const { who, admin } of VIEWERS) {
    it(`should ${admin ? 'name' : 'not name'} the model that read the chapter on every review route for ${who}`, async () => {
      const controller = new ChapterReviewController(reviews, viewer(admin));
      const response = { status: () => response } as never;

      const listed = await controller.listReviews(params);
      const views = [
        ...listed.latest,
        ...listed.history,
        await controller.getReview(params),
        await controller.runReview(params, { kind: 'judge' } as never, response),
        await controller.remedyFinding(params, {} as never),
        await controller.clearRemedy(params),
      ];

      for (const view of views) {
        expect('model' in view && 'modelProvider' in view).toBe(admin);
        expect(view).toMatchObject({ costTier: 'balanced' });
      }
    });
  }
});

describe('chat messages', () => {
  const createdAt = new Date('2026-10-01T00:00:00Z');
  const user = { id: 1n, sessionId: 's1', ordinal: 1, role: 'user', content: 'hi', modelProvider: null, modelId: null, createdAt } as unknown as Refinement.ChatMessage;
  const reply = { ...user, id: 2n, ordinal: 2, role: 'assistant', content: 'hello', runId: 'run-1', modelProvider: 'synapse', modelId: MODEL_ID };
  const turnResult = { userMessage: user, assistantMessage: reply, proposal: null, runId: 'run-1' } as unknown as ChatTurnResult;
  const sessions = { listMessages: async () => [user, reply] } as unknown as ChatSessionService;
  const chat = { turnStatus: async () => ({ pendingTurn: null, failedTurn: null }), authorNotes: async () => '', turn: async () => turnResult } as unknown as ChatService;
  const turnCost = { forMessages: async () => new Map([[2n, { costUsd: 0.1, inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }]]) } as unknown as TurnCostService;

  for (const { who, admin } of VIEWERS) {
    it(`should ${admin ? 'name' : 'not name'} the model that wrote a reply in the transcript for ${who}, keeping its cost`, async () => {
      const { messages } = await new ChatController(chat, sessions, turnCost, viewer(admin)).listMessages({ projectId: 1n, sessionId: 's1' }, {} as never);

      expect(messages[1]?.modelId).toBe(admin ? MODEL_ID : undefined);
      for (const message of messages) expect('modelId' in message || 'modelProvider' in message).toBe(admin);
      expect(messages[1]?.costUsd).toBe(0.1);
    });

    it(`should ${admin ? 'name' : 'not name'} the model on a synchronous turn for ${who}`, async () => {
      const turn = await new ChatController(chat, sessions, turnCost, viewer(admin)).createTurn({ projectId: 1n, sessionId: 's1' }, { content: 'hi' } as never);

      expect(turn.assistantMessage.modelId).toBe(admin ? MODEL_ID : undefined);
      expect('modelProvider' in turn.userMessage).toBe(admin);
      expect(turn.assistantMessage.costUsd).toBe(0.1);
    });
  }

  it('should drop model identity from a stored user or done frame as it goes out, and pass every other frame unchanged', () => {
    const message = { id: '2', role: 'assistant', content: 'hello', modelProvider: 'synapse', modelId: MODEL_ID, costUsd: 0.1 };
    const done = { event: 'done', id: '9', data: JSON.stringify({ userMessage: { ...message, role: 'user' }, assistantMessage: message, runId: 'run-1' }) } as const;
    const delta = { event: 'delta', id: '3', data: JSON.stringify({ text: MODEL_ID }) } as const;

    const sent = JSON.parse(frameWithoutModel(done).data) as Record<string, Record<string, unknown>>;
    const sentUser = JSON.parse(frameWithoutModel({ event: 'user', data: JSON.stringify(message) }).data) as Record<string, unknown>;

    expect(sent['assistantMessage']).toEqual({ id: '2', role: 'assistant', content: 'hello', costUsd: 0.1 });
    expect(sent['userMessage']).not.toHaveProperty('modelId');
    expect(sentUser).not.toHaveProperty('modelProvider');
    expect(frameWithoutModel(done).id).toBe('9');
    expect(frameWithoutModel(delta)).toBe(delta);
  });

  it("should drop a proposal's model from a done frame stored before proposals stopped carrying one", () => {
    const message = { id: '2', role: 'assistant', content: 'hello' };
    const proposal = { id: '5', status: 'pending', model: MODEL_ID };
    const stored = {
      event: 'done',
      data: JSON.stringify({ userMessage: message, assistantMessage: message, proposal, appliedProposal: { ...proposal, id: '6' }, runId: 'run-1' }),
    } as const;

    const sent = JSON.parse(frameWithoutModel(stored).data) as Record<string, Record<string, unknown>>;

    expect(sent['proposal']).toEqual({ id: '5', status: 'pending' });
    expect(sent['appliedProposal']).toEqual({ id: '6', status: 'pending' });
    expect(JSON.parse(frameWithoutModel({ ...stored, data: JSON.stringify({ userMessage: message, assistantMessage: message }) }).data)).not.toHaveProperty('proposal');
  });

  it('should never put the drafting model on a proposal, for anyone', () => {
    const proposal = { id: 1n, model: MODEL_ID, changeSet: [], baseline: {}, status: 'pending', inverseOps: null } as unknown as Refinement.Proposal;

    expect(serialiseProposal(proposal)).not.toHaveProperty('model');
  });
});

describe('TurnStreamController.streamTurn', () => {
  const reply = { id: '2', role: 'assistant', content: 'hello', modelProvider: 'synapse', modelId: MODEL_ID };
  const stored: TurnStreamFrame[] = [
    { event: 'user', id: '1', data: JSON.stringify({ id: '1', role: 'user', content: 'hi', modelProvider: null, modelId: null }) },
    { event: 'delta', id: '2', data: JSON.stringify({ text: 'hel' }) },
    { event: 'done', id: '3', data: JSON.stringify({ userMessage: { id: '1', role: 'user' }, assistantMessage: reply, proposal: { id: '5', model: MODEL_ID }, runId: 'run-1' }) },
  ];

  async function streamed(admin: boolean, lastEventId?: string): Promise<{ written: string; cursors: (number | null)[] }> {
    const writes: string[] = [];
    const cursors: (number | null)[] = [];
    const turnStreams = {
      assertRun: async () => undefined,
      follow: (_projectId: bigint, _runId: string, cursor: number | null, listener: TurnStreamListener) => {
        cursors.push(cursor);
        for (const frame of stored.filter(entry => Number(entry.id) > (cursor ?? 0))) listener(frame);
        return () => undefined;
      },
    } as unknown as TurnStreamService;
    const raw = { writeHead: () => undefined, write: (chunk: string) => writes.push(chunk), on: () => undefined, off: () => undefined, end: () => undefined };
    const response = { hijack: () => undefined, getHeaders: () => ({}), raw, request: { raw: {} }, server: {} } as unknown as HttpResponse;
    const headers = lastEventId === undefined ? {} : { 'last-event-id': lastEventId };

    await new TurnStreamController(turnStreams, viewer(admin)).streamTurn({ projectId: 1n, runId: 'run-1' }, headers, response);
    return { written: writes.join(''), cursors };
  }

  it('should send an author every frame of a turn replayed from the start with no model identity', async () => {
    const { written, cursors } = await streamed(false);

    expect(cursors).toEqual([null]);
    expect(written).toContain('event: user');
    expect(written).toContain('event: delta');
    expect(written).toContain('"content":"hello"');
    for (const field of ['modelId', 'modelProvider', MODEL_ID]) expect(written).not.toContain(field);
  });

  it('should keep model identity out of a done frame an author resumes to from a cursor', async () => {
    const { written, cursors } = await streamed(false, '2');

    expect(cursors).toEqual([2]);
    expect(written).toContain('id: 3\nevent: done');
    expect(written).not.toContain('event: user');
    expect(written).not.toContain(MODEL_ID);
  });

  it('should send an admin the stored frames untouched, live and resumed', async () => {
    for (const cursor of [undefined, '2']) {
      const { written } = await streamed(true, cursor);

      expect(written).toContain(`"modelId":"${MODEL_ID}"`);
      expect(written).toContain(stored[2]?.data ?? '');
    }
  });
});
