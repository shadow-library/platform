import { describe, expect, it } from 'bun:test';

import { type ChatMessageResponse, type ChatTurnResponse } from '../src/lib/apis/api-types.gen';
import { type ChatTurnStreamEvent, type ChatTurnStreamState, idleChatTurnStream, parseChatTurnEvent, reduceChatTurnStream } from '../src/lib/apis/refinement.api';

const message = (ordinal: number, role: string, content: string): ChatMessageResponse => ({
  id: `m${ordinal}`,
  sessionId: 's1',
  ordinal,
  role,
  content,
  createdAt: '2026-09-19T10:00:00.000Z',
});

const turn: ChatTurnResponse = { userMessage: message(1, 'user', 'who is Vex?'), assistantMessage: message(2, 'assistant', 'Vex is the exiled cartographer.'), runId: 'r1' };

const lookup = (round: number, tool: string, status: 'running' | 'ok' | 'error'): ChatTurnStreamEvent => ({ type: 'lookup', lookup: { round, tool, args: { id: 'vex' }, status } });
const delta = (text: string): ChatTurnStreamEvent => ({ type: 'delta', text });

function play(events: ChatTurnStreamEvent[], from: ChatTurnStreamState = idleChatTurnStream): ChatTurnStreamState {
  return events.reduce(reduceChatTurnStream, from);
}

describe('parseChatTurnEvent', () => {
  it('should parse a delta', () => {
    expect(parseChatTurnEvent('delta', '{"text":"Vex "}')).toEqual({ type: 'delta', text: 'Vex ' });
  });

  it('should parse a reset carrying an empty payload', () => {
    expect(parseChatTurnEvent('reset', '{}')).toEqual({ type: 'reset' });
  });

  it('should parse a lookup', () => {
    expect(parseChatTurnEvent('lookup', '{"round":0,"tool":"get_bible_document","args":{"id":"vex"},"status":"running"}')).toEqual({
      type: 'lookup',
      lookup: { round: 0, tool: 'get_bible_document', args: { id: 'vex' }, status: 'running' },
    });
  });

  it('should parse an error frame', () => {
    expect(parseChatTurnEvent('error', '{"code":"AI_007","message":"model timed out"}')).toEqual({ type: 'error', failure: { code: 'AI_007', message: 'model timed out' } });
  });

  it('should ignore a lookup whose status is not one the protocol declares', () => {
    expect(parseChatTurnEvent('lookup', '{"round":0,"tool":"get_arc","args":{},"status":"pending"}')).toBeUndefined();
  });

  it('should ignore an event name it does not know', () => {
    expect(parseChatTurnEvent('ready', '{}')).toBeUndefined();
  });

  it('should ignore a payload that is not JSON', () => {
    expect(parseChatTurnEvent('delta', 'not json')).toBeUndefined();
  });
});

describe('reduceChatTurnStream', () => {
  it('should accumulate deltas into the streamed reply', () => {
    expect(play([delta('Vex '), delta('is exiled.')]).reply).toBe('Vex is exiled.');
  });

  it('should void the streamed reply on a reset and render what follows', () => {
    const state = play([delta('a first attempt'), { type: 'reset' }, delta('the replacement')]);

    expect(state.reply).toBe('the replacement');
    expect(state.status).toBe('streaming');
  });

  it('should keep the lookups a reset arrives after, because only the deltas are void', () => {
    const state = play([lookup(0, 'get_arc', 'ok'), delta('a first attempt'), { type: 'reset' }]);

    expect(state.reply).toBe('');
    expect(state.lookups).toEqual([{ round: 0, tool: 'get_arc', args: { id: 'vex' }, status: 'ok' }]);
  });

  it('should keep the partial text on an error, unlike a reset', () => {
    const failed = play([delta('half a rep'), { type: 'error', failure: { code: 'AI_007', message: 'model timed out' } }]);
    const reset = play([delta('half a rep'), { type: 'reset' }]);

    expect(failed.reply).toBe('half a rep');
    expect(failed.status).toBe('failed');
    expect(reset.reply).toBe('');
  });

  it('should settle a lookup in place rather than listing it twice', () => {
    expect(play([lookup(0, 'get_arc', 'running'), lookup(0, 'get_arc', 'ok')]).lookups).toEqual([{ round: 0, tool: 'get_arc', args: { id: 'vex' }, status: 'ok' }]);
  });

  it('should list a later round separately from the same tool in an earlier one', () => {
    expect(play([lookup(0, 'get_arc', 'ok'), lookup(1, 'get_arc', 'ok')]).lookups).toHaveLength(2);
  });

  it('should survive the replay a reconnect receives without duplicating anything', () => {
    const live = [{ type: 'user' as const, message: message(1, 'user', 'who is Vex?') }, lookup(0, 'get_arc', 'running'), lookup(0, 'get_arc', 'ok'), delta('Vex is')];
    const replayed = play([...live, { type: 'reset' }, ...live]);

    expect(replayed.reply).toBe('Vex is');
    expect(replayed.lookups).toHaveLength(1);
    expect(replayed.userMessage?.content).toBe('who is Vex?');
  });

  it('should render the authoritative reply from done when the model streamed no deltas at all', () => {
    const state = play([{ type: 'done', turn }]);

    expect(state.reply).toBe('Vex is the exiled cartographer.');
    expect(state.status === 'done' && state.turn.runId).toBe('r1');
  });

  it('should replace a streamed reply with the one done persisted', () => {
    expect(play([delta('Vex is the exiled'), { type: 'done', turn }]).reply).toBe('Vex is the exiled cartographer.');
  });

  it('should ignore anything that arrives after the turn has ended', () => {
    expect(play([{ type: 'done', turn }, delta(' and more')]).reply).toBe('Vex is the exiled cartographer.');
  });
});
