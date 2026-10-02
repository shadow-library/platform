import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StreamedTurn } from '../src/features/chat/StreamedTurn';
import { TurnLiveTail, TurnTrace } from '../src/features/chat/TurnTimeline';
import { type ChatTurnResponse, type ChatTurnTraceResponse } from '../src/lib/apis/api-types.gen';
import { type ChatTurnStreamEvent, type ChatTurnStreamState, reduceChatTurnStream, startChatTurnStream, stopChatTurnStream } from '../src/lib/apis/refinement.api';
import { lookupLabel } from '../src/lib/chat-lookup-label';
import { readingLabel, readSummary, timelineOfTrace, turnTimeline } from '../src/lib/chat-turn-timeline';

const turn = {
  userMessage: { id: 'm1', sessionId: 's', ordinal: 1, role: 'user', content: 'hi', createdAt: '2026-09-19T10:00:00.000Z' },
  assistantMessage: { id: 'm2', sessionId: 's', ordinal: 2, role: 'assistant', content: 'Done.', createdAt: '2026-09-19T10:00:00.000Z' },
  runId: 'r1',
} as ChatTurnResponse;

const lookup = (tool: string, status: 'running' | 'ok' | 'error', args: Record<string, unknown> = {}, round = 0): ChatTurnStreamEvent => ({
  type: 'lookup',
  lookup: { round, tool, args, status },
});
const delta = (text = 'Here is the plan.'): ChatTurnStreamEvent => ({ type: 'delta', text });
const change = (index: number): ChatTurnStreamEvent => ({ type: 'change', change: { index, op: 'entity.upsert', label: 'Vex', group: 'people' } });

function play(events: [ChatTurnStreamEvent, number][], start = 0): ChatTurnStreamState {
  return events.reduce((state, [event, at]) => reduceChatTurnStream(state, event, at), startChatTurnStream(start));
}

const READ: [ChatTurnStreamEvent, number][] = [
  [lookup('get_notes', 'ok', { from: 11 }), 1000],
  [lookup('get_bible_document', 'ok', { slug: 'premise' }), 1500],
  [lookup('get_bible_document', 'ok', { slug: 'magic-system' }), 2000],
];

describe('turnTimeline', () => {
  it('should show only the starting tail right after send', () => {
    expect(turnTimeline(startChatTurnStream(0), 500, 'auto')).toEqual({ live: true, trace: [], saving: null, tail: { kind: 'starting', slow: false }, worked: null });
  });

  it('should name the source being read and list every source so far', () => {
    const view = turnTimeline(play([...READ, [lookup('get_notes', 'running', { from: 20 }), 2500]]), 3000, 'auto');

    expect(view.trace).toHaveLength(1);
    expect(view.trace[0]).toMatchObject({ key: 'read', label: 'Reading notes from ¶20…', running: true });
    expect(view.trace[0]?.sources.map(source => source.status)).toEqual(['ok', 'ok', 'ok', 'running']);
    expect(view.tail).toEqual({ kind: 'working', elapsed: '3s', slow: false });
  });

  it('should settle reading into a plain-words summary and think below it', () => {
    const view = turnTimeline(play(READ), 4000, 'auto');

    expect(view.trace.map(row => [row.label, row.running])).toEqual([
      ['Read your notes and 2 Bible pages', false],
      ['Thinking', true],
    ]);
  });

  it('should collapse thinking into a plain row once the reply starts, with no reasoning to open', () => {
    const view = turnTimeline(play([...READ, [delta(), 10_000]]), 11_000, 'auto');

    expect(view.trace[1]).toEqual({ key: 'think', label: 'Thought for 10s', running: false, sources: [] });
    expect(view.tail).toEqual({ kind: 'working', elapsed: '11s', slow: false });
  });

  it('should leave out a think shorter than a second', () => {
    expect(turnTimeline(play([[delta(), 400]]), 500, 'auto').trace).toEqual([]);
  });

  it('should word saving by the session mode', () => {
    const state = play([
      [delta(), 1000],
      [change(0), 1100],
      [change(1), 1200],
    ]);

    expect(turnTimeline(state, 1300, 'auto').saving).toMatchObject({ label: 'Saving to your Story Bible · 2', running: true });
    expect(turnTimeline(state, 1300, 'manual').saving).toMatchObject({ label: 'Preparing suggestions · 2', running: true });
  });

  it('should settle saving while the reply goes on, and claim nothing once the turn ends', () => {
    const writing = play([
      [delta(), 1000],
      [change(0), 1100],
      [delta(' More.'), 1200],
    ]);

    expect(turnTimeline(writing, 1300, 'auto').saving).toMatchObject({ label: 'Saving to your Story Bible · 1', running: false });
    expect(turnTimeline(writing, 1300, 'manual').saving?.label).toBe('Preparing suggestions · 1');
    expect(turnTimeline(stopChatTurnStream(writing, 1400), 1500, 'auto').saving).toBeNull();
  });

  it('should drop changes a reset voided', () => {
    const voided = play([
      [delta(), 1000],
      [change(0), 1100],
      [{ type: 'reset' }, 1200],
    ]);

    expect(turnTimeline(voided, 1300, 'auto').saving).toBeNull();
  });

  it('should turn slow past the threshold', () => {
    expect(turnTimeline(startChatTurnStream(0), 44_999, 'auto').tail?.slow).toBe(false);
    expect(turnTimeline(play([[delta(), 1000]]), 45_000, 'auto').tail).toEqual({ kind: 'working', elapsed: '45s', slow: true });
  });

  it('should not read on once a turn stopped mid-lookup', () => {
    const stopped = stopChatTurnStream(play([[lookup('get_notes', 'running'), 100]]), 200);

    expect(turnTimeline(stopped, 300, 'auto').trace[0]).toMatchObject({ key: 'read', running: false });
  });

  it('should settle a finished turn with no tail and a worked line', () => {
    const done = play([...READ, [delta(), 10_000], [{ type: 'done', turn }, 48_000]]);
    const view = turnTimeline(done, 99_000, 'auto');

    expect(view.live).toBe(false);
    expect(view.tail).toBeNull();
    expect(view.trace.every(row => !row.running)).toBe(true);
    expect(view.worked).toBe('Worked 48s · read 3 sources');
  });

  it('should say a stopped turn stopped, and say nothing for a failed one', () => {
    expect(turnTimeline(stopChatTurnStream(play([[delta(), 1000]]), 12_000), 20_000, 'auto').worked).toBe('Stopped after 12s');
    const failed = play([
      [delta(), 1000],
      [{ type: 'error', failure: { code: 'AI_007', message: 'x' } }, 2000],
    ]);
    expect(turnTimeline(failed, 3000, 'auto').worked).toBeNull();
  });
});

describe('timelineOfTrace', () => {
  const traced = (trace: ChatTurnTraceResponse): ChatTurnResponse => ({ ...turn, assistantMessage: { ...turn.assistantMessage, trace } });
  const READ_TRACE: ChatTurnTraceResponse = {
    sources: [
      { tool: 'get_notes', args: { from: 11 }, status: 'ok' },
      { tool: 'get_bible_document', args: { slug: 'premise' }, status: 'ok' },
      { tool: 'get_bible_document', args: { slug: 'magic-system' }, status: 'ok' },
    ],
    timing: { readMs: 0, thinkMs: 10_000, writeMs: 38_000, workedMs: 48_000 },
  };

  it('should word a saved trace exactly as the stream it was saved from settled', () => {
    const watched = turnTimeline(play([...READ, [delta(), 10_000], [{ type: 'done', turn }, 48_000]]), 99_000, 'auto');

    expect(timelineOfTrace(READ_TRACE)).toEqual(watched);
    expect(watched.trace.map(row => row.label)).toEqual(['Read your notes and 2 Bible pages', 'Thought for 10s']);
  });

  it('should label a query the server clipped as the live turn labelled it unclipped', () => {
    const query = 'where the lamp-keepers first lit the harbour lamps at dusk';
    const view = timelineOfTrace({
      sources: [{ tool: 'search_lore', args: { query: `${query.slice(0, 40).trimEnd()}…` }, status: 'ok' }],
      timing: { readMs: 900, thinkMs: 0, workedMs: 2000 },
    });

    expect(view.trace[0]?.sources[0]?.label).toBe(lookupLabel('search_lore', { query }));
  });

  it('should keep a reply that streamed nothing to its think row and worked line', () => {
    const view = timelineOfTrace({ sources: [], timing: { readMs: 0, thinkMs: 3200, workedMs: 4100 } });

    expect(view).toEqual({ live: false, trace: [{ key: 'think', label: 'Thought for 3s', running: false, sources: [] }], saving: null, tail: null, worked: 'Worked 4s' });
    expect(timelineOfTrace({ sources: [], timing: { readMs: 0, thinkMs: 400, workedMs: 900 } }).trace).toEqual([]);
  });

  it('should name what could not be read and count only what was', () => {
    const partly = timelineOfTrace({
      sources: [
        { tool: 'get_notes', args: {}, status: 'ok' },
        { tool: 'get_draft', args: { chapter: 1 }, status: 'error' },
      ],
      timing: { readMs: 1500, thinkMs: 0, workedMs: 6000 },
    });
    const none = timelineOfTrace({ sources: [{ tool: 'get_draft', args: { chapter: 1 }, status: 'error' }], timing: { readMs: 500, thinkMs: 0, workedMs: 2000 } });

    expect(partly.trace[0]).toMatchObject({ label: 'Read your notes · 1 couldn’t be read', running: false });
    expect(partly.trace[0]?.sources.map(source => [source.label, source.status])).toEqual([
      ['Your notes', 'ok'],
      ['Chapter 1 draft', 'error'],
    ]);
    expect(partly.worked).toBe('Worked 6s · read 1 source');
    expect(none.trace[0]?.label).toBe('Couldn’t read 1 source');
    expect(none.worked).toBe('Worked 2s');
  });

  it('should draw a done stream from its reply’s trace, so the refetched reply changes nothing', () => {
    const asked = play([...READ, [lookup('get_notes', 'ok', { from: 11, limit: 40 }), 3000], [delta(), 10_000]]);
    const done = reduceChatTurnStream(asked, { type: 'done', turn: traced(READ_TRACE) }, 48_000);

    expect(turnTimeline(asked, 11_000, 'auto').trace[0]?.sources).toHaveLength(4);
    expect(turnTimeline(done, 99_000, 'auto')).toEqual(timelineOfTrace(READ_TRACE));
  });

  it('should fall back to the stream for a reply saved without a trace', () => {
    const done = play([...READ, [delta(), 10_000], [{ type: 'done', turn: { ...turn, assistantMessage: { ...turn.assistantMessage, trace: null } } }, 48_000]]);

    expect(turnTimeline(done, 99_000, 'auto').worked).toBe('Worked 48s · read 3 sources');
  });
});

describe('readSummary', () => {
  const settled = (tool: string, args: Record<string, unknown> = {}, status: 'ok' | 'error' = 'ok') => ({ round: 0, tool, args, status });

  it('should count a source asked for twice once', () => {
    expect(readSummary([settled('get_entity', { entityKey: 'vex' }), { ...settled('get_entity', { entityKey: 'vex' }), round: 1 }])).toBe('Read 1 profile');
  });

  it('should fall back to a count past three kinds of source', () => {
    expect(readSummary([settled('get_notes'), settled('get_entity'), settled('get_draft'), settled('search_lore', { query: 'x' })])).toBe('Read 4 sources');
  });

  it('should name what could not be read', () => {
    expect(readSummary([settled('get_notes'), settled('get_draft', { chapter: 1 }, 'error')])).toBe('Read your notes · 1 couldn’t be read');
    expect(readSummary([settled('get_draft', { chapter: 1 }, 'error')])).toBe('Couldn’t read 1 source');
  });

  it('should word an unknown tool as another source', () => {
    expect(readSummary([settled('get_mystery')])).toBe('Read 1 other source');
  });
});

describe('readingLabel', () => {
  it('should turn a source into the act of reading it', () => {
    expect(readingLabel({ tool: 'get_draft', args: { chapter: 2 } })).toBe('Reading chapter 2 draft…');
    expect(readingLabel({ tool: 'search_lore', args: { query: 'ley' } })).toBe('Searching the lore for “ley”…');
    expect(readingLabel({ tool: 'get_mystery', args: {} })).toBe('Looking something up…');
  });

  it('should keep the case of a Bible page’s own title', () => {
    expect(readingLabel({ tool: 'get_bible_document', args: { slug: 'vex' } })).toBe('Reading Vex…');
  });
});

const html = (element: React.ReactElement): string => renderToStaticMarkup(element);

describe('TurnTrace', () => {
  it('should make a row with sources a collapsed disclosure and a row without one plain text', () => {
    const view = turnTimeline(play([...READ, [delta(), 10_000]]), 11_000, 'auto');
    const out = html(createElement(TurnTrace, { rows: view.trace }));

    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('Read your notes and 2 Bible pages');
    expect(out).toContain('Thought for 10s');
    expect(out.match(/<button/g)).toHaveLength(1);
    expect(out).not.toContain('Notes from ¶11');
  });

  it('should draw a reloaded reply’s rows from its trace', () => {
    const out = html(
      createElement(TurnTrace, {
        rows: timelineOfTrace({ sources: [{ tool: 'get_notes', args: {}, status: 'ok' }], timing: { readMs: 1000, thinkMs: 4000, workedMs: 9000 } }).trace,
      }),
    );

    expect(out).toContain('Read your notes');
    expect(out).toContain('Thought for 4s');
    expect(out.match(/<button/g)).toHaveLength(1);
  });

  it('should render nothing without rows', () => {
    expect(html(createElement(TurnTrace, { rows: [] }))).toBe('');
  });
});

describe('TurnLiveTail', () => {
  it('should think while starting and show the elapsed time once working', () => {
    expect(html(createElement(TurnLiveTail, { tail: { kind: 'starting', slow: false } }))).toContain('Thinking');
    expect(html(createElement(TurnLiveTail, { tail: { kind: 'working', elapsed: '12s', slow: false } }))).toContain('12s');
  });

  it('should announce the turn once in a status line, and name a slow one visibly', () => {
    const working = html(createElement(TurnLiveTail, { tail: { kind: 'working', elapsed: '12s', slow: false } }));
    const slow = html(createElement(TurnLiveTail, { tail: { kind: 'working', elapsed: '46s', slow: true } }));

    expect(working.match(/role="status"/g)).toHaveLength(1);
    expect(working).toContain('Forge is working on your message');
    expect(working).not.toContain('longer than usual');
    expect(slow.match(/taking longer than usual/g)).toHaveLength(2);
  });
});

describe('StreamedTurn', () => {
  it('should keep the live tail below the reply and the saving row', () => {
    const out = html(
      createElement(StreamedTurn, {
        stream: play([
          [delta(), 1000],
          [change(0), 1100],
        ]),
        mode: 'auto',
        now: 5000,
      }),
    );

    expect(out.indexOf('Here is the plan.')).toBeLessThan(out.indexOf('Saving to your Story Bible · 1'));
    expect(out.indexOf('Saving to your Story Bible · 1')).toBeLessThan(out.indexOf('5s'));
  });

  it('should put the receipt under the model line and let a footer replace the worked line', () => {
    const done = play([
      [delta(), 1000],
      [{ type: 'done', turn }, 3000],
    ]);
    const out = html(
      createElement(StreamedTurn, { stream: done, mode: 'auto', now: 9000, receipt: createElement('p', null, 'receipt'), footer: createElement('p', null, 'model line') }),
    );

    expect(out).toContain('receipt');
    expect(out.indexOf('<p>model line</p>')).toBeLessThan(out.indexOf('<p>receipt</p>'));
    expect(out).not.toContain('Worked');
    expect(html(createElement(StreamedTurn, { stream: done, mode: 'auto', now: 9000 }))).toContain('Worked 3s');
  });
});
