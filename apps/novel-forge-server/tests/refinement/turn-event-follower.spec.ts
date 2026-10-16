import { describe, expect, it } from 'bun:test';

import { TurnEventFollower, type TurnEventSource } from '@modules/refinement/turn-event-follower';
import { type TurnRunLiveness } from '@modules/refinement/turn-event.repository';
import { type TurnEventRecord, type TurnStreamFrame } from '@modules/refinement/turn-stream.types';

const PROJECT_ID = 1n;
const RUN_ID = 'run-1';
const OPTIONS = { livenessCheckMs: 5_000, ownerSilenceMs: 30_000 };

interface FakeSource extends TurnEventSource {
  records: TurnEventRecord[];
  run: TurnRunLiveness | null;
  livenessChecks: number;
  /** Stored the moment the run's liveness is read, as a terminal frame landing between the two reads would be. */
  storedOnCheck: TurnEventRecord[];
}

function fakeSource(records: TurnEventRecord[] = []): FakeSource {
  const source: FakeSource = {
    records,
    run: { status: 'running', silentMs: 0 },
    livenessChecks: 0,
    storedOnCheck: [],
    eventsAfter: async (_projectId, _runId, after, limit) => source.records.filter(record => record.seq > after).slice(0, limit),
    runLiveness: async () => {
      source.livenessChecks++;
      source.records.push(...source.storedOnCheck.splice(0));
      return source.run;
    },
  };
  return source;
}

function following(source: TurnEventSource, after: number | null, accept = () => true): { follower: TurnEventFollower; frames: TurnStreamFrame[] } {
  const frames: TurnStreamFrame[] = [];
  const listener = (frame: TurnStreamFrame): boolean => (frames.push(frame), accept());
  return { follower: new TurnEventFollower(source, PROJECT_ID, RUN_ID, after, listener, OPTIONS, 0), frames };
}

const record = (seq: number, event: TurnEventRecord['event'], data = '{}'): TurnEventRecord => ({ seq, event, data });
const shape = (frames: TurnStreamFrame[]): string[] => frames.map(frame => `${frame.id ?? '-'} ${frame.event} ${frame.data}`);

describe('TurnEventFollower', () => {
  it('should open a stream with no cursor on a reset, then send each stored frame with its seq as the id', async () => {
    const source = fakeSource([record(1, 'user'), record(2, 'delta', '{"text":"Hi"}')]);
    const { follower, frames } = following(source, null);

    expect(await follower.pull(0)).toBe(true);
    expect(shape(frames)).toEqual(['- reset {}', '1 user {}', '2 delta {"text":"Hi"}']);
  });

  it('should hold a stream opened before the first frame open, and send the frames once they are written', async () => {
    const source = fakeSource();
    const { follower, frames } = following(source, null);

    expect(await follower.pull(0)).toBe(true);
    source.records.push(record(1, 'user'));
    expect(await follower.pull(250)).toBe(true);
    expect(shape(frames)).toEqual(['- reset {}', '1 user {}']);
  });

  it('should resume after the cursor with no reset, and send each frame once across reads', async () => {
    const source = fakeSource([record(1, 'user'), record(2, 'delta'), record(3, 'change')]);
    const { follower, frames } = following(source, 2);

    await follower.pull(0);
    source.records.push(record(4, 'delta'));
    await follower.pull(250);
    expect(shape(frames)).toEqual(['3 change {}', '4 delta {}']);
  });

  it('should replay a finished turn through its terminal frame and close, even when a reconnect missed its end', async () => {
    const source = fakeSource([record(1, 'user'), record(2, 'delta'), record(3, 'done'), record(4, 'delta')]);
    const { follower, frames } = following(source, 1);

    expect(await follower.pull(0)).toBe(false);
    expect(shape(frames)).toEqual(['2 delta {}', '3 done {}']);
  });

  it('should step over a gap a lost batch left in the sequence', async () => {
    const { follower, frames } = following(fakeSource([record(1, 'user'), record(4, 'delta')]), 0);

    await follower.pull(0);
    expect(frames.map(frame => frame.id)).toEqual(['1', '4']);
  });

  it('should page through a backlog longer than one read', async () => {
    const records = Array.from({ length: 450 }, (_, index) => record(index + 1, 'delta'));
    const { follower, frames } = following(fakeSource(records), 0);

    await follower.pull(0);
    expect(frames).toHaveLength(450);
  });

  it('should ask whether the run is alive only after a quiet spell, and stay open while its replica heartbeats', async () => {
    const source = fakeSource();
    const { follower, frames } = following(source, 0);

    expect(await follower.pull(4_999)).toBe(true);
    expect(source.livenessChecks).toBe(0);
    source.run = { status: 'running', silentMs: 3_000 };
    expect(await follower.pull(5_000)).toBe(true);
    expect(source.livenessChecks).toBe(1);
    expect(frames).toEqual([]);
  });

  it('should end the stream with an error of its own once the run has stopped heartbeating without a terminal frame', async () => {
    const source = fakeSource([record(1, 'delta')]);
    source.run = { status: 'running', silentMs: 31_000 };
    const { follower, frames } = following(source, 0);

    expect(await follower.pull(0)).toBe(true);
    expect(await follower.pull(5_000)).toBe(false);
    const failure = frames.at(-1);
    expect(failure?.event).toBe('error');
    expect(failure?.id).toBeUndefined();
    expect(JSON.parse(failure?.data ?? '{}')).toMatchObject({ code: 'CHT_013' });
  });

  it('should end the stream as not found once the run row is gone', async () => {
    const source = fakeSource();
    source.run = null;
    const { follower, frames } = following(source, 0);

    expect(await follower.pull(5_000)).toBe(false);
    expect(JSON.parse(frames[0]?.data ?? '{}')).toMatchObject({ code: 'CHT_007' });
  });

  it('should keep waiting on a run that settled within the writer’s retry budget for its end', async () => {
    const source = fakeSource();
    source.run = { status: 'completed', silentMs: 16_000 };
    const { follower, frames } = following(source, 0);

    expect(await follower.pull(5_000)).toBe(true);
    expect(frames).toEqual([]);
  });

  it('should end a stream whose run settled without a terminal frame with an error naming how it settled, never CHT_013', async () => {
    const endings: Record<string, string> = {};
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const source = fakeSource();
      source.run = { status, silentMs: 45_000 };
      const { follower, frames } = following(source, 0);
      await follower.pull(5_000);
      endings[status] = `${frames[0]?.event} ${JSON.parse(frames[0]?.data ?? '{}').code}`;
    }

    expect(endings).toEqual({ completed: 'error CHT_014', failed: 'error CHT_015', cancelled: 'error AI_013' });
  });

  it('should send a terminal frame stored while the run was being checked, rather than an error of its own', async () => {
    const source = fakeSource([record(1, 'delta')]);
    source.run = { status: 'completed', silentMs: 45_000 };
    source.storedOnCheck = [record(2, 'done')];
    const { follower, frames } = following(source, 1);

    expect(await follower.pull(5_000)).toBe(false);
    expect(shape(frames)).toEqual(['2 done {}']);
  });

  it('should stop reading once the client has gone', async () => {
    const source = fakeSource([record(1, 'user'), record(2, 'delta')]);
    const { follower, frames } = following(source, null, () => false);

    expect(await follower.pull(0)).toBe(false);
    expect(await follower.pull(250)).toBe(false);
    expect(shape(frames)).toEqual(['- reset {}']);
  });
});
