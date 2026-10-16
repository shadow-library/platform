import { describe, expect, it } from 'bun:test';

import { RUN_OWNER_SILENCE_MS } from '@modules/ai/graphs/run-liveness';
import { encodeFrameData, TERMINAL_RETRY_BUDGET_MS, TurnEventLog, type TurnEventSink } from '@modules/refinement/turn-event-log';
import { type TurnEventRecord } from '@modules/refinement/turn-stream.types';

const PROJECT_ID = 1n;
const RUN_ID = 'run-1';

function recordingSink(failures = 0): TurnEventSink & { batches: TurnEventRecord[][] } {
  let failing = failures;
  const batches: TurnEventRecord[][] = [];
  return {
    batches,
    append: async (_projectId, _runId, records) => {
      if (failing-- > 0) throw new Error('connection reset');
      batches.push(records);
    },
  };
}

const shape = (records: TurnEventRecord[]): string[] => records.map(record => `${record.seq} ${record.event} ${record.data}`);

describe('TurnEventLog', () => {
  it('should merge consecutive deltas into one frame, never across a frame of another kind', async () => {
    const sink = recordingSink();
    const log = new TurnEventLog(sink, PROJECT_ID, RUN_ID, { coalesceMs: 60_000 });

    log.delta('Once ');
    log.delta('upon');
    log.append('change', { index: 0 });
    log.delta(' a time');
    await log.flush();

    expect(sink.batches.map(shape)).toEqual([['1 delta {"text":"Once upon"}', '2 change {"index":0}', '3 delta {"text":" a time"}']]);
  });

  it('should start a new delta frame once the window holding the previous one was written', async () => {
    const sink = recordingSink();
    const log = new TurnEventLog(sink, PROJECT_ID, RUN_ID, { coalesceMs: 60_000 });

    log.delta('One.');
    await log.flush();
    log.delta(' Two.');
    await log.flush();

    expect(sink.batches.map(shape)).toEqual([['1 delta {"text":"One."}'], ['2 delta {"text":" Two."}']]);
  });

  it('should write the terminal frame at once behind whatever was still gathering, and drop anything after it', async () => {
    const sink = recordingSink();
    const log = new TurnEventLog(sink, PROJECT_ID, RUN_ID, { coalesceMs: 60_000 });

    log.append('user', { content: 'Hi' });
    log.delta('Hello.');
    await log.finish('done', { turn: 1 });
    log.delta('late');
    await log.finish('error', {});
    await log.flush();

    expect(log.closed).toBe(true);
    expect(sink.batches.map(shape)).toEqual([['1 user {"content":"Hi"}', '2 delta {"text":"Hello."}', '3 done {"turn":1}']]);
  });

  it('should keep frames in order across batches whose writes are still in flight', async () => {
    const order: number[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => (release = resolve));
    const sink: TurnEventSink = {
      append: async (_projectId, _runId, records) => {
        if (records[0]?.seq === 1) await held;
        order.push(...records.map(record => record.seq));
      },
    };
    const log = new TurnEventLog(sink, PROJECT_ID, RUN_ID, { coalesceMs: 60_000 });

    log.delta('A');
    const first = log.flush();
    log.append('change', {});
    const second = log.flush();
    release();
    await Promise.all([first, second]);

    expect(order).toEqual([1, 2]);
  });

  it('should retry a failed write, and give a batch up without stalling the ones behind it', async () => {
    const retried = recordingSink(1);
    const retriedLog = new TurnEventLog(retried, PROJECT_ID, RUN_ID, { coalesceMs: 60_000, retryDelayMs: 0 });
    await retriedLog.finish('done', {});

    const lost = recordingSink(2);
    const lostLog = new TurnEventLog(lost, PROJECT_ID, RUN_ID, { coalesceMs: 60_000, attempts: 2, retryDelayMs: 0 });
    lostLog.delta('gone');
    await lostLog.flush();
    await lostLog.finish('done', {});

    expect(retried.batches.map(shape)).toEqual([['1 done {}']]);
    expect(lost.batches.map(shape)).toEqual([['2 done {}']]);
  });

  it('should keep retrying a done after attempts that would give up an ordinary batch', async () => {
    const sink = recordingSink(2);
    const log = new TurnEventLog(sink, PROJECT_ID, RUN_ID, { coalesceMs: 60_000, attempts: 1, retryDelayMs: 0 });

    await log.finish('done', { turn: 1 });

    expect(sink.batches.map(shape)).toEqual([['1 done {"turn":1}']]);
  });

  it('should retry a terminal frame for less time than a reader waits before it gives up on the run', () => {
    expect(TERMINAL_RETRY_BUDGET_MS).toBeGreaterThan(10_000);
    expect(TERMINAL_RETRY_BUDGET_MS).toBeLessThan(RUN_OWNER_SILENCE_MS);
  });
});

describe('encodeFrameData', () => {
  it('should write bigints as strings and swap what jsonb rejects for a replacement character', () => {
    expect(encodeFrameData({ id: 12n, text: 'a\u0000b\ud800c', emoji: '\u{1F600}' })).toBe('{"id":"12","text":"a\uFFFDb\uFFFDc","emoji":"\u{1F600}"}');
  });

  it('should swap the same characters out of keys, at any depth', () => {
    expect(encodeFrameData({ args: { 'q\u0000': 1, nested: [{ '\udc00k': 2 }] } })).toBe('{"args":{"q\uFFFD":1,"nested":[{"\uFFFDk":2}]}}');
  });
});
