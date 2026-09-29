import { describe, expect, it } from 'bun:test';

import { editQueued, inputCaption, queuedNote, type QueuedTurn, queuedView, type QueueState, queueStep, releaseSettings, restoreFailed } from '../src/features/chat/chat-queue';

const queued: QueuedTurn = {
  content: 'Make it darker',
  proseEdits: true,
  justDiscussing: false,
  choice: { contentMode: 'standard', costTier: 'economy' },
  watching: true,
  after: 'r1',
};
const state = (overrides: Partial<QueueState> = {}): QueueState => ({ queued, running: false, locked: false, stream: 'done', finishedId: 'r2', inTranscript: true, ...overrides });

describe('queueStep', () => {
  it('should do nothing without a queued message', () => {
    expect(queueStep(state({ queued: undefined }))).toBe('none');
    expect(queueStep(state({ queued: undefined, running: true }))).toBe('none');
  });

  it('should wait while the turn runs', () => {
    expect(queueStep(state({ running: true, stream: 'streaming', finishedId: undefined }))).toBe('waiting');
  });

  it('should send once the reply of the turn this tab watched is done and in the transcript', () => {
    expect(queueStep(state())).toBe('send');
    expect(queueStep(state({ queued: { ...queued, after: undefined } }))).toBe('send');
  });

  it('should wait for the transcript to hold the finished reply before sending', () => {
    expect(queueStep(state({ inTranscript: false }))).toBe('waiting');
  });

  it('should hold the message after a failed or stopped turn', () => {
    expect(queueStep(state({ stream: 'failed', finishedId: undefined }))).toBe('held');
    expect(queueStep(state({ stream: 'stopped', finishedId: undefined }))).toBe('held');
  });

  it('should hold the message when the turn ran in another tab, even though this tab’s stream still says done', () => {
    expect(queueStep(state({ queued: { ...queued, watching: false }, finishedId: 'r1' }))).toBe('held');
    expect(queueStep(state({ queued: { ...queued, watching: false } }))).toBe('held');
  });

  it('should hold the message when the only finished reply is the one from before it was queued', () => {
    expect(queueStep(state({ finishedId: 'r1' }))).toBe('held');
  });

  it('should hold the message rather than send into a locked chat', () => {
    expect(queueStep(state({ locked: true }))).toBe('held');
  });
});

describe('queuedView', () => {
  it('should show nothing without a queued message', () => {
    expect(queuedView(undefined, 'none', 'idle')).toBeUndefined();
  });

  it('should show a waiting message without a note and a held one with the reason', () => {
    expect(queuedView(queued, 'waiting', 'streaming')).toEqual({ text: 'Make it darker', held: false, note: undefined });
    expect(queuedView(queued, 'held', 'failed')).toEqual({ text: 'Make it darker', held: true, note: queuedNote('failed') });
  });

  it('should not blame a stale failure of this tab’s stream for a turn that ran elsewhere', () => {
    expect(queuedView({ ...queued, watching: false }, 'held', 'failed')?.note).toBe('Waiting for you.');
  });

  it('should say why a held message did not send', () => {
    expect(queuedNote('failed')).toContain('failed');
    expect(queuedNote('stopped')).toContain('stopped');
    expect(queuedNote('idle')).toBe('Waiting for you.');
  });
});

describe('releaseSettings', () => {
  const current = { proseEdits: false, justDiscussing: true, choice: { contentMode: 'unrestricted' as const, costTier: 'performant' as const } };

  it('should keep the settings a message was queued with when it sends on its own', () => {
    expect(releaseSettings(queued, current, 'auto')).toEqual({ proseEdits: true, justDiscussing: false, choice: queued.choice });
  });

  it('should send with what the composer shows now when the author presses Send now', () => {
    expect(releaseSettings(queued, current, 'now')).toEqual(current);
  });
});

describe('editQueued', () => {
  it('should restore the text and the settings it was queued with', () => {
    expect(editQueued(queued, '')).toEqual({ input: 'Make it darker', settings: { proseEdits: true, justDiscussing: false, choice: queued.choice } });
  });

  it('should put the queued text above anything typed since', () => {
    expect(editQueued(queued, '  ').input).toBe('Make it darker');
    expect(editQueued(queued, 'and shorter').input).toBe('Make it darker\nand shorter');
  });
});

describe('restoreFailed', () => {
  it('should put a queued message that never reached the server back in the queue, not in the box', () => {
    expect(restoreFailed(queued, undefined, false)).toEqual({ queue: queued });
  });

  it('should fall back to the box when a newer message has taken the queue', () => {
    expect(restoreFailed(queued, undefined, true)).toEqual({ input: 'Make it darker' });
  });

  it('should return a typed draft to the box and do nothing without one', () => {
    expect(restoreFailed(undefined, 'hello', false)).toEqual({ input: 'hello' });
    expect(restoreFailed(undefined, undefined, false)).toEqual({});
  });
});

describe('inputCaption', () => {
  const base = { input: 'more', running: true, queued: true, switching: false };

  it('should explain a no-op Enter only while the box holds text', () => {
    expect(inputCaption(base)).toContain('already queued');
    expect(inputCaption({ ...base, input: ' ' })).toBeUndefined();
  });

  it('should explain a mode change that is still saving', () => {
    expect(inputCaption({ ...base, running: false, queued: false, switching: true })).toContain('Saving the mode');
  });

  it('should stay quiet when Enter will work', () => {
    expect(inputCaption({ ...base, queued: false })).toBeUndefined();
  });
});
