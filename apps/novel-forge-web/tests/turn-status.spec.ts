import { describe, expect, it } from 'bun:test';

import { type ChatTurnStatusResponse, type ListChatMessagesResponse } from '../src/lib/apis/api-types.gen';
import { transcriptBehind, transcriptTurnState } from '../src/lib/apis/refinement.api';
import { ApiError } from '../src/lib/apis/transport';

const message = (ordinal: number): ListChatMessagesResponse['messages'][number] => ({
  id: String(ordinal),
  sessionId: 's1',
  ordinal,
  role: 'user',
  content: 'hi',
  createdAt: '2026-09-12T19:00:00.000Z',
});
const pending = { runId: 'r1', graph: 'chat-turn', startedAt: '2026-09-12T19:00:00.000Z' };
const failed = { runId: 'r1', graph: 'chat-turn', status: 'failed' as const, endedAt: '2026-09-12T19:00:01.000Z', code: 'AI_007', message: null };

function transcript(ordinals: number[], turns: Partial<ListChatMessagesResponse> = {}): ListChatMessagesResponse {
  return { messages: ordinals.map(message), pendingTurn: null, failedTurn: null, ...turns };
}

function status(lastOrdinal: number, turns: Partial<ChatTurnStatusResponse> = {}): ChatTurnStatusResponse {
  return { lastOrdinal, pendingTurn: null, failedTurn: null, ...turns };
}

describe('transcriptBehind', () => {
  it('should not refetch over a message the server has not stored yet', () => {
    expect(transcriptBehind(transcript([1, 2]), status(1, { pendingTurn: pending }))).toBe(false);
  });

  it('should refetch once the transcript has grown on the server', () => {
    expect(transcriptBehind(transcript([1], { pendingTurn: pending }), status(2))).toBe(true);
  });

  it('should refetch when the turn it shows as running has ended', () => {
    expect(transcriptBehind(transcript([1], { pendingTurn: pending }), status(1))).toBe(true);
  });

  it('should refetch when the server has recorded a failure the transcript does not show', () => {
    expect(transcriptBehind(transcript([1], { pendingTurn: pending }), status(1, { failedTurn: failed }))).toBe(true);
  });

  it('should not refetch while the server agrees with the transcript', () => {
    expect(transcriptBehind(transcript([1], { pendingTurn: pending }), status(1, { pendingTurn: pending }))).toBe(false);
  });

  it('should not refetch before either side has loaded', () => {
    expect(transcriptBehind(undefined, status(3))).toBe(false);
    expect(transcriptBehind(transcript([1]), undefined)).toBe(false);
  });
});

describe('transcriptTurnState', () => {
  const notFound = new ApiError(404, { code: 'PRJ_001', type: 'NOT_FOUND', message: 'Project not found' });

  it('should report the cached running turn while the transcript still loads', () => {
    expect(transcriptTurnState({ data: transcript([1], { pendingTurn: pending }), error: null })).toEqual({ kind: 'pending', pending });
  });

  it('should drop a cached running turn once the chat is gone from the server', () => {
    expect(transcriptTurnState({ data: transcript([1], { pendingTurn: pending }), error: notFound })).toEqual({ kind: 'idle' });
  });

  it('should keep the cached running turn through a transient failure', () => {
    const unavailable = new ApiError(503, { code: 'SRV_001', type: 'SERVER_ERROR', message: 'Unavailable' });
    expect(transcriptTurnState({ data: transcript([1], { pendingTurn: pending }), error: unavailable })).toEqual({ kind: 'pending', pending });
  });
});
