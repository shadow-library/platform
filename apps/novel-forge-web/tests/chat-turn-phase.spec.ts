import { describe, expect, it } from 'bun:test';

import { type ChatTurnResponse } from '../src/lib/apis/api-types.gen';
import { type ChatTurnStreamEvent, type ChatTurnStreamState, reduceChatTurnStream, startChatTurnStream, stopChatTurnStream } from '../src/lib/apis/refinement.api';
import { lookupLabel } from '../src/lib/chat-lookup-label';
import { turnPhase, turnSummary } from '../src/lib/chat-turn-phase';

const turn = {
  userMessage: { id: 'm1', sessionId: 's', ordinal: 1, role: 'user', content: 'hi', createdAt: '2026-09-19T10:00:00.000Z' },
  assistantMessage: { id: 'm2', sessionId: 's', ordinal: 2, role: 'assistant', content: 'hello', createdAt: '2026-09-19T10:00:00.000Z' },
  runId: 'r1',
} as ChatTurnResponse;

const lookup = (tool: string, status: 'running' | 'ok' | 'error', args: Record<string, unknown> = {}, round = 0): ChatTurnStreamEvent => ({
  type: 'lookup',
  lookup: { round, tool, args, status },
});
const delta = (text = 'x'): ChatTurnStreamEvent => ({ type: 'delta', text });
const change = (index: number): ChatTurnStreamEvent => ({ type: 'change', change: { index, op: 'entity.upsert', label: 'Vex', group: 'people' } });
const reset: ChatTurnStreamEvent = { type: 'reset' };

function at(state: ChatTurnStreamState, event: ChatTurnStreamEvent, time: number): ChatTurnStreamState {
  return reduceChatTurnStream(state, event, time);
}

describe('turnPhase', () => {
  it('should be starting until the first event arrives', () => {
    expect(turnPhase(startChatTurnStream(0), 500)).toEqual({ kind: 'starting' });
  });

  it('should think from the turn start when no lookup ran, measuring time since', () => {
    const state = at(startChatTurnStream(1000), { type: 'user', message: turn.userMessage }, 1100);

    expect(turnPhase(state, 4000)).toEqual({ kind: 'thinking', sinceMs: 3000 });
  });

  it('should read while a lookup runs, naming the current source', () => {
    let state = at(startChatTurnStream(0), lookup('get_notes', 'ok', { from: 3 }), 100);
    state = at(state, lookup('get_draft', 'running', { chapter: 2 }), 200);

    expect(turnPhase(state, 300)).toEqual({ kind: 'reading', sources: 2, settled: 1, current: 'Chapter 2 draft' });
  });

  it('should think from the moment the last lookup settled', () => {
    let state = at(startChatTurnStream(0), lookup('get_notes', 'running'), 100);
    state = at(state, lookup('get_notes', 'ok'), 400);

    expect(turnPhase(state, 1400)).toEqual({ kind: 'thinking', sinceMs: 1000 });
  });

  it('should settle a failed lookup like a finished one', () => {
    const state = at(at(startChatTurnStream(0), lookup('get_notes', 'running'), 100), lookup('get_notes', 'error'), 200);

    expect(turnPhase(state, 300).kind).toBe('thinking');
  });

  it('should write once a delta arrives and save once a change does', () => {
    const writing = at(startChatTurnStream(0), delta(), 100);
    const saving = at(writing, change(0), 200);

    expect(turnPhase(writing, 300)).toEqual({ kind: 'writing' });
    expect(turnPhase(saving, 300)).toEqual({ kind: 'saving', count: 1 });
  });

  it('should save on a change that precedes any delta', () => {
    expect(turnPhase(at(startChatTurnStream(0), change(0), 100), 200)).toEqual({ kind: 'saving', count: 1 });
  });

  it('should go back to reading, then thinking, when a lookup round follows the reply', () => {
    let state = at(startChatTurnStream(0), delta(), 100);
    state = at(state, lookup('search_lore', 'running', { query: 'ley lines' }, 1), 200);

    expect(turnPhase(state, 250).kind).toBe('reading');

    state = at(state, lookup('search_lore', 'ok', { query: 'ley lines' }, 1), 300);

    expect(turnPhase(state, 800)).toEqual({ kind: 'thinking', sinceMs: 500 });
    expect(turnPhase(at(state, delta(), 900), 950)).toEqual({ kind: 'writing' });
  });

  it('should think again after a reset, from the reset', () => {
    const state = at(at(startChatTurnStream(0), delta(), 100), reset, 500);

    expect(turnPhase(state, 800)).toEqual({ kind: 'thinking', sinceMs: 300 });
  });

  it('should keep reading through a reset that arrives while a lookup runs', () => {
    const state = at(at(startChatTurnStream(0), lookup('get_notes', 'running'), 100), reset, 200);

    expect(turnPhase(state, 300).kind).toBe('reading');
  });

  it('should show saving only while changes are the latest write, in either order', () => {
    const changeFirst = at(at(startChatTurnStream(0), change(0), 100), delta(), 200);
    const replyFirst = at(at(startChatTurnStream(0), delta(), 100), change(0), 200);

    expect(turnPhase(changeFirst, 300)).toEqual({ kind: 'writing' });
    expect(turnPhase(replyFirst, 300)).toEqual({ kind: 'saving', count: 1 });
  });

  it('should keep the full think time across the opening reset and a reset before the next round', () => {
    const opened = at(at(startChatTurnStream(0), reset, 10), delta(), 1000);
    let state = at(startChatTurnStream(0), delta(), 100);
    state = at(state, lookup('get_notes', 'running'), 200);
    state = at(state, lookup('get_notes', 'ok'), 300);
    state = at(state, reset, 400);
    state = at(state, delta(), 1000);

    expect(opened.timing.thoughtMs).toBe(1000);
    expect(state.timing.thoughtMs).toBe(100 + 700);
  });

  it('should keep the think time through a full replay burst mid-think', () => {
    let state = at(startChatTurnStream(0), lookup('get_notes', 'running'), 100);
    state = at(state, lookup('get_notes', 'ok'), 200);
    state = at(state, reset, 5000);
    state = at(state, { type: 'user', message: turn.userMessage }, 5000);
    state = at(state, lookup('get_notes', 'running'), 5000);
    state = at(state, lookup('get_notes', 'ok'), 5000);
    state = at(state, delta(), 9000);

    expect(state.lookups).toEqual([{ round: 0, tool: 'get_notes', args: {}, status: 'ok' }]);
    expect(state.timing.thoughtMs).toBe(8800);
  });

  it('should keep thinking through a reconnect that replays round-one deltas and lookups', () => {
    let state = at(startChatTurnStream(0), delta(), 100);
    state = at(state, lookup('get_notes', 'running'), 200);
    state = at(state, lookup('get_notes', 'ok'), 300);
    state = at(state, reset, 5000);
    state = at(state, delta(), 5000);
    state = at(state, lookup('get_notes', 'running'), 5000);
    state = at(state, lookup('get_notes', 'ok'), 5000);

    expect(turnPhase(state, 7000)).toEqual({ kind: 'thinking', sinceMs: 2000 });

    state = at(state, reset, 9000);
    state = at(state, delta(), 9000);

    expect(state.timing.thoughtMs).toBe(8800);
  });

  it('should be settled once the turn is done, failed or stopped', () => {
    const base = at(startChatTurnStream(0), delta(), 100);

    expect(turnPhase(at(base, { type: 'done', turn }, 200), 300).kind).toBe('settled');
    expect(turnPhase(at(base, { type: 'error', failure: { code: 'X', message: 'y' } }, 200), 300).kind).toBe('settled');
    expect(turnPhase(stopChatTurnStream(base, 200), 300).kind).toBe('settled');
  });
});

describe('turnSummary', () => {
  it('should report sources, thinking and total time for a finished turn', () => {
    let state = at(startChatTurnStream(0), lookup('get_notes', 'running'), 1000);
    state = at(state, lookup('get_notes', 'ok'), 3000);
    state = at(state, lookup('get_draft', 'running', { chapter: 1 }), 3000);
    state = at(state, lookup('get_draft', 'ok', { chapter: 1 }), 4000);
    state = at(state, delta(), 13000);
    state = at(state, change(0), 20000);
    state = at(state, { type: 'done', turn }, 48000);

    expect(turnSummary(state, 99999)).toEqual({ sources: 2, thoughtMs: 9000, workedMs: 48000 });
  });

  it('should add thinking across a second lookup round', () => {
    let state = at(startChatTurnStream(0), delta(), 2000);
    state = at(state, lookup('get_notes', 'running'), 3000);
    state = at(state, lookup('get_notes', 'ok'), 4000);
    state = at(state, delta(), 7000);

    expect(turnSummary(state, 8000).thoughtMs).toBe(2000 + 3000);
  });

  it('should count the wait as thinking when the turn ends without writing', () => {
    const state = at(startChatTurnStream(0), { type: 'error', failure: { code: 'X', message: 'y' } }, 6000);

    expect(turnSummary(state, 9000)).toMatchObject({ thoughtMs: 6000, workedMs: 6000 });
  });

  it('should measure a running turn against now, and be zero before it began', () => {
    const idle = startChatTurnStream(0);

    expect(turnSummary(startChatTurnStream(1000), 4000).workedMs).toBe(3000);
    expect(turnSummary({ ...idle, timing: { ...idle.timing, startedAt: null, waitingSince: null } }, 4000).workedMs).toBe(0);
  });
});

describe('lookupLabel', () => {
  it.each([
    ['get_notes', { from: 11 }, 'Notes from ¶11'],
    ['get_notes', { part: 2 }, 'Notes, part 2'],
    ['get_notes', { query: 'the vault' }, 'Notes mentioning “the vault”'],
    ['get_notes', {}, 'Your notes'],
    ['get_bible_document', { section: 'power', slug: 'ley-lines' }, 'Ley lines'],
    ['get_bible_document', { section: 'story_state' }, 'Story state page'],
    ['get_bible_document', {}, 'Story Bible page'],
    ['get_brief', { chapter: 3 }, 'Chapter 3 plan'],
    ['get_draft', { chapter: 3 }, 'Chapter 3 draft'],
    ['get_review', { chapter: 3, kind: 'continuity' }, 'Chapter 3 review'],
    ['get_review', {}, 'A chapter review'],
    ['get_canon_facts', { keys: ['a'] }, 'Canon facts'],
    ['get_chapter_summaries', { from: 2, to: 6 }, 'Summaries of chapters 2–6'],
    ['get_chapter_summaries', { from: 4, to: 4 }, 'Summary of chapter 4'],
    ['get_chapter_summaries', {}, 'Chapter summaries'],
    ['get_character_timeline', { entityKey: 'character:vex-marrow' }, 'Timeline of Vex marrow'],
    ['get_entity', { entityKey: 'vex' }, 'Profile of Vex'],
    ['get_entity', {}, 'A profile'],
    ['get_plot_threads', { status: 'open' }, 'Open plot threads'],
    ['get_plot_threads', {}, 'Plot threads'],
    ['get_usage', {}, 'Usage figures'],
    ['get_volume', { volumeKey: 'vol_one' }, 'Volume plan: Vol one'],
    ['get_world_facts', { category: 'geography' }, 'World facts: Geography'],
    ['get_world_facts', {}, 'World facts'],
    ['search_lore', { query: 'ley lines' }, 'Searched the lore for “ley lines”'],
    ['search_prose', { query: 'a storm' }, 'Searched the prose for “a storm”'],
    ['search_prose', {}, 'Searched the prose'],
    ['get_arc', {}, 'Looked something up'],
    ['constructor', {}, 'Looked something up'],
  ])('should label %s %j as %s', (tool, args, label) => {
    expect(lookupLabel(tool, args)).toBe(label);
  });

  it('should ignore non-string and blank args and truncate long queries', () => {
    expect(lookupLabel('get_bible_document', { section: 4, slug: '  ' })).toBe('Story Bible page');
    expect(lookupLabel('search_lore', { query: 'x'.repeat(80) })).toBe(`Searched the lore for “${'x'.repeat(40)}…”`);
  });
});
