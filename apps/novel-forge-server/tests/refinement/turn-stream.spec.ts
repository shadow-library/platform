import { describe, expect, it } from 'bun:test';

import { type ChatTurnEmitter } from '@modules/refinement/chat-turn-emitter';
import { type TurnStreamFrame, TurnStreamService } from '@modules/refinement/turn-stream.service';

const PROJECT_ID = 1n;
const RUN_ID = 'run-1';

async function startedTurn(): Promise<{ service: TurnStreamService; emitter: ChatTurnEmitter }> {
  let captured: ChatTurnEmitter | undefined;
  const chatService = {
    turn: (_projectId: bigint, _sessionId: string, _content: string, emitter: ChatTurnEmitter) => {
      captured = emitter;
      emitter.onRunId(RUN_ID);
      return new Promise(() => undefined);
    },
  };
  const service = new TurnStreamService(chatService as never, {} as never);
  await service.start(PROJECT_ID, 'session-1', 'Hello.');
  if (!captured) throw new Error('turn never started');
  return { service, emitter: captured };
}

function collect(service: TurnStreamService, frames: TurnStreamFrame[]): () => void {
  return service.subscribe(PROJECT_ID, RUN_ID, frame => {
    frames.push(frame);
    return true;
  });
}

const shape = (frames: TurnStreamFrame[]): string[] => frames.map(frame => `${frame.event} ${frame.data}`);

describe('TurnStreamService', () => {
  it('should replay change events in order behind the leading reset, including the resets between attempts', async () => {
    const { service, emitter } = await startedTurn();
    emitter.onDelta('Draft.');
    emitter.onChange({ index: 0, op: 'premise.update', label: 'Premise', group: 'premise' });
    emitter.onReset();
    emitter.onChange({ index: 0, op: 'entity.upsert', label: 'Mara', group: 'people' });

    const frames: TurnStreamFrame[] = [];
    collect(service, frames);
    expect(shape(frames)).toEqual([
      'reset {}',
      'delta {"text":"Draft."}',
      'change {"index":0,"op":"premise.update","label":"Premise","group":"premise"}',
      'reset {}',
      'change {"index":0,"op":"entity.upsert","label":"Mara","group":"people"}',
    ]);
  });

  it('should carry the reply’s trace on the done frame', async () => {
    const trace = { sources: [{ tool: 'get_notes', args: { query: 'ledger' }, status: 'ok' as const }], timing: { readMs: 400, thinkMs: 900, writeMs: 1200, workedMs: 2500 } };
    const message = (id: bigint, role: string, extra: object = {}) => ({
      id,
      sessionId: 'session-1',
      ordinal: Number(id),
      role,
      content: 'Text.',
      createdAt: new Date(0),
      ...extra,
    });
    const chatService = {
      turn: async (_projectId: bigint, _sessionId: string, _content: string, emitter: ChatTurnEmitter) => {
        emitter.onRunId(RUN_ID);
        return { runId: RUN_ID, userMessage: message(1n, 'user'), assistantMessage: message(2n, 'assistant', { trace }), proposal: null };
      },
    };
    const service = new TurnStreamService(chatService as never, { forMessages: async () => new Map() } as never);
    await service.start(PROJECT_ID, 'session-1', 'Where is the ledger?');
    await Bun.sleep(0);

    const frames: TurnStreamFrame[] = [];
    collect(service, frames);
    const done = frames.find(frame => frame.event === 'done');
    expect(JSON.parse(done?.data ?? '{}')).toMatchObject({ assistantMessage: { trace }, userMessage: { trace: null } });
  });

  it('should give a reconnecting subscriber the same replay once, then only live change events', async () => {
    const { service, emitter } = await startedTurn();
    emitter.onChange({ index: 0, op: 'premise.update', label: 'Premise', group: 'premise' });

    const first: TurnStreamFrame[] = [];
    collect(service, first)();
    const second: TurnStreamFrame[] = [];
    collect(service, second);
    emitter.onChange({ index: 1, op: 'promise.create', label: 'Who rang?', group: 'threads' });

    expect(shape(first)).toEqual(['reset {}', 'change {"index":0,"op":"premise.update","label":"Premise","group":"premise"}']);
    expect(shape(second)).toEqual([
      'reset {}',
      'change {"index":0,"op":"premise.update","label":"Premise","group":"premise"}',
      'change {"index":1,"op":"promise.create","label":"Who rang?","group":"threads"}',
    ]);
  });
});
