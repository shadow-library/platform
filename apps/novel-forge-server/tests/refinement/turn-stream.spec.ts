import { describe, expect, it } from 'bun:test';

import { type ChatTurnEmitter } from '@modules/refinement/chat-turn-emitter';
import { type TurnRunState } from '@modules/refinement/turn-event.repository';
import { resumeCursorOf, TurnStreamService } from '@modules/refinement/turn-stream.service';
import { type TurnEventRecord } from '@modules/refinement/turn-stream.types';

const PROJECT_ID = 1n;
const RUN_ID = 'run-1';

function fakeTurnEvents(run?: TurnRunState): { repository: never; written: TurnEventRecord[] } {
  const written: TurnEventRecord[] = [];
  const repository = {
    append: async (_projectId: bigint, _runId: string, records: TurnEventRecord[]) => void written.push(...records),
    findRun: async (projectId: bigint, runId: string) => (projectId === PROJECT_ID && runId === RUN_ID ? run : undefined),
  };
  return { repository: repository as never, written };
}

const message = (id: bigint, role: string, extra: object = {}) => ({ id, sessionId: 'session-1', ordinal: Number(id), role, content: 'Text.', createdAt: new Date(0), ...extra });

function settledTurn(emit: (emitter: ChatTurnEmitter) => void, assistant: object = {}) {
  return {
    turn: async (_projectId: bigint, _sessionId: string, _content: string, emitter: ChatTurnEmitter) => {
      emitter.onRunId(RUN_ID);
      emit(emitter);
      return { runId: RUN_ID, userMessage: message(1n, 'user'), assistantMessage: message(2n, 'assistant', assistant), proposal: null };
    },
  };
}

const shape = (records: TurnEventRecord[]): string[] => records.map(record => `${record.seq} ${record.event} ${record.data}`);

describe('TurnStreamService', () => {
  it('should store the turn’s frames in the order it emitted them, ending with done', async () => {
    const { repository, written } = fakeTurnEvents();
    const chatService = settledTurn(emitter => {
      emitter.onDelta('Draft.');
      emitter.onChange({ index: 0, op: 'premise.update', label: 'Premise', group: 'premise' });
      emitter.onReset();
      emitter.onChange({ index: 0, op: 'entity.upsert', label: 'Mara', group: 'people' });
    });
    const service = new TurnStreamService(chatService as never, { forMessages: async () => new Map() } as never, repository);

    await service.start(PROJECT_ID, 'session-1', 'Hello.');
    await Bun.sleep(0);

    expect(shape(written).slice(0, 4)).toEqual([
      '1 delta {"text":"Draft."}',
      '2 change {"index":0,"op":"premise.update","label":"Premise","group":"premise"}',
      '3 reset {}',
      '4 change {"index":0,"op":"entity.upsert","label":"Mara","group":"people"}',
    ]);
    expect(written.at(-1)?.event).toBe('done');
  });

  it('should carry the reply’s trace on the done frame, and still end the stream when its cost cannot be read', async () => {
    const trace = { sources: [{ tool: 'get_notes', args: { query: 'ledger' }, status: 'ok' as const }], timing: { readMs: 400, thinkMs: 900, writeMs: 1200, workedMs: 2500 } };
    const { repository, written } = fakeTurnEvents();
    const turnCost = { forMessages: async () => Promise.reject(new Error('usage read failed')) };
    const service = new TurnStreamService(settledTurn(() => undefined, { trace }) as never, turnCost as never, repository);

    await service.start(PROJECT_ID, 'session-1', 'Where is the ledger?');
    await Bun.sleep(0);

    const done = written.find(record => record.event === 'done');
    expect(JSON.parse(done?.data ?? '{}')).toMatchObject({ assistantMessage: { trace }, userMessage: { trace: null } });
  });

  it('should store an error frame for a turn that fails once its run exists', async () => {
    const { repository, written } = fakeTurnEvents();
    const chatService = {
      turn: async (_projectId: bigint, _sessionId: string, _content: string, emitter: ChatTurnEmitter) => {
        emitter.onRunId(RUN_ID);
        throw new Error('model gone');
      },
    };
    const service = new TurnStreamService(chatService as never, {} as never, repository);

    expect(await service.start(PROJECT_ID, 'session-1', 'Hello.')).toBe(RUN_ID);
    await Bun.sleep(0);

    expect(written.map(record => record.event)).toEqual(['error']);
    expect(JSON.parse(written[0]?.data ?? '{}')).toMatchObject({ code: 'UNKNOWN' });
  });

  it('should find a running turn before it has written a frame, and an ended one while its frames are kept', async () => {
    const running = new TurnStreamService({} as never, {} as never, fakeTurnEvents({ running: true, hasEvents: false, recentlyEnded: false }).repository);
    const ended = new TurnStreamService({} as never, {} as never, fakeTurnEvents({ running: false, hasEvents: true, recentlyEnded: false }).repository);

    expect(await running.assertRun(PROJECT_ID, RUN_ID)).toBeUndefined();
    expect(await ended.assertRun(PROJECT_ID, RUN_ID)).toBeUndefined();
  });

  it('should find a turn that failed moments ago before its error frame is stored', async () => {
    const failedFast = new TurnStreamService({} as never, {} as never, fakeTurnEvents({ running: false, hasEvents: false, recentlyEnded: true }).repository);

    expect(await failedFast.assertRun(PROJECT_ID, RUN_ID)).toBeUndefined();
  });

  it('should answer an unknown run, another project’s run and an ended run whose frames were swept as not found', async () => {
    const service = new TurnStreamService({} as never, {} as never, fakeTurnEvents({ running: true, hasEvents: true, recentlyEnded: false }).repository);
    const swept = new TurnStreamService({} as never, {} as never, fakeTurnEvents({ running: false, hasEvents: false, recentlyEnded: false }).repository);

    await expect(service.assertRun(PROJECT_ID, 'run-9')).rejects.toMatchObject({ code: 'CHT_007' });
    await expect(service.assertRun(2n, RUN_ID)).rejects.toMatchObject({ code: 'CHT_007' });
    await expect(swept.assertRun(PROJECT_ID, RUN_ID)).rejects.toMatchObject({ code: 'CHT_007' });
  });
});

describe('resumeCursorOf', () => {
  it('should resume after a seq the stream sent, and replay from the start for anything else', () => {
    expect(resumeCursorOf('42')).toBe(42);
    expect(resumeCursorOf('0')).toBe(0);
    expect(resumeCursorOf(undefined)).toBeNull();
    expect(resumeCursorOf('')).toBeNull();
    expect(resumeCursorOf('-1')).toBeNull();
    expect(resumeCursorOf('12345678901')).toBeNull();
    expect(resumeCursorOf(['3'])).toBeNull();
  });
});
