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
  it('should show only a thinking tail, without a clock, right after send', () => {
    expect(turnTimeline(startChatTurnStream(0), 500, 'auto')).toEqual({
      live: true,
      trace: [],
      saving: null,
      tail: { label: 'Thinking', elapsed: null, starting: true, slow: false },
      worked: null,
    });
  });

  it('should name the source being read in the tail and sum up only what has come back', () => {
    const view = turnTimeline(play([...READ, [lookup('get_notes', 'running', { from: 20 }), 2500]]), 3000, 'auto');

    expect(view.trace).toEqual([expect.objectContaining({ key: 'read', label: 'Read your notes and 2 Bible pages' })]);
    expect(view.trace[0]?.sources.map(source => source.status)).toEqual(['ok', 'ok', 'ok']);
    expect(view.tail).toEqual({ label: 'Reading notes from ¶20', elapsed: '3s', starting: false, slow: false });
  });

  it('should leave the read row out until a first source comes back', () => {
    const view = turnTimeline(play([[lookup('get_notes', 'running'), 500]]), 1500, 'auto');

    expect(view.trace).toEqual([]);
    expect(view.tail?.label).toBe('Reading your notes');
  });

  it('should settle reading into a plain-words summary and keep thinking on the tail’s one line', () => {
    const view = turnTimeline(play(READ), 4000, 'auto');

    expect(view.trace.map(row => row.label)).toEqual(['Read your notes and 2 Bible pages']);
    expect(view.tail).toEqual({ label: 'Thinking', elapsed: '4s', starting: false, slow: false });
  });

  it('should leave no trace of thinking once the reply starts', () => {
    const view = turnTimeline(play([...READ, [delta(), 10_000]]), 11_000, 'auto');

    expect(view.trace.map(row => row.key)).toEqual(['read']);
    expect(view.tail).toEqual({ label: 'Writing', elapsed: '11s', starting: false, slow: false });
  });

  it('should show thinking again on the tail when the model goes back to it', () => {
    const rethinking = play([...READ, [delta(), 10_000], [lookup('get_entity', 'ok', { entityKey: 'vex' }), 12_000]]);
    const view = turnTimeline(rethinking, 20_000, 'auto');

    expect(view.trace.map(row => row.label)).toEqual(['Read your notes, 2 Bible pages and 1 profile']);
    expect(view.tail?.label).toBe('Thinking');
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

    expect(turnTimeline(state, 1300, 'auto')).toMatchObject({ saving: null, tail: { label: 'Saving 2 changes to your Story Bible' } });
    expect(turnTimeline(state, 1300, 'manual')).toMatchObject({ saving: null, tail: { label: 'Preparing 2 suggestions' } });
  });

  it('should settle saving while the reply goes on, and claim nothing once the turn ends', () => {
    const writing = play([
      [delta(), 1000],
      [change(0), 1100],
      [delta(' More.'), 1200],
    ]);

    expect(turnTimeline(writing, 1300, 'auto')).toMatchObject({ saving: { label: 'Saving 1 change to your Story Bible' }, tail: { label: 'Writing' } });
    expect(turnTimeline(writing, 1300, 'manual').saving?.label).toBe('Preparing 1 suggestion');
    expect(turnTimeline(stopChatTurnStream(writing, 1400), 1500, 'auto').saving).toBeNull();
  });

  it('should drop changes a reset voided', () => {
    const voided = play([
      [delta(), 1000],
      [change(0), 1100],
      [{ type: 'reset' }, 1200],
    ]);

    expect(turnTimeline(voided, 1300, 'auto')).toMatchObject({ saving: null, tail: { label: 'Thinking' } });
  });

  it('should turn slow past the threshold', () => {
    expect(turnTimeline(startChatTurnStream(0), 44_999, 'auto').tail?.slow).toBe(false);
    expect(turnTimeline(play([[delta(), 1000]]), 45_000, 'auto').tail).toEqual({ label: 'Writing', elapsed: '45s', starting: false, slow: true });
  });

  it('should not read on once a turn stopped mid-lookup', () => {
    const stopped = stopChatTurnStream(play([[lookup('get_notes', 'running'), 100]]), 200);

    expect(turnTimeline(stopped, 300, 'auto')).toMatchObject({ trace: [{ key: 'read', label: 'Read your notes' }], tail: null });
  });

  it('should settle a finished turn with no tail and a worked line', () => {
    const done = play([...READ, [delta(), 10_000], [{ type: 'done', turn }, 48_000]]);
    const view = turnTimeline(done, 99_000, 'auto');

    expect(view.live).toBe(false);
    expect(view.tail).toBeNull();
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
    expect(watched.trace.map(row => row.label)).toEqual(['Read your notes and 2 Bible pages']);
  });

  it('should label a query the server clipped as the live turn labelled it unclipped', () => {
    const query = 'where the lamp-keepers first lit the harbour lamps at dusk';
    const view = timelineOfTrace({
      sources: [{ tool: 'search_lore', args: { query: `${query.slice(0, 40).trimEnd()}…` }, status: 'ok' }],
      timing: { readMs: 900, thinkMs: 0, workedMs: 2000 },
    });

    expect(view.trace[0]?.sources[0]?.label).toBe(lookupLabel('search_lore', { query }));
  });

  it('should keep a reply that read nothing to its worked line alone', () => {
    expect(timelineOfTrace({ sources: [], timing: { readMs: 0, thinkMs: 3200, workedMs: 4100 } })).toEqual({
      live: false,
      trace: [],
      saving: null,
      tail: null,
      worked: 'Worked 4s',
    });
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

    expect(partly.trace[0]).toMatchObject({ label: 'Read your notes · 1 couldn’t be read' });
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

  it('should count web searches and pages under their own names', () => {
    expect(
      readSummary([
        settled('search_web', { query: 'winter survival' }),
        settled('fetch_page', { url: 'https://example.com/a' }),
        settled('fetch_page', { url: 'https://example.com/b' }),
      ]),
    ).toBe('Read 1 web search and 2 web pages');
  });

  it('should word an unknown tool as another source', () => {
    expect(readSummary([settled('get_mystery')])).toBe('Read 1 other source');
  });
});

describe('readingLabel', () => {
  it('should turn a source into the act of reading it', () => {
    expect(readingLabel({ tool: 'get_draft', args: { chapter: 2 } })).toBe('Reading chapter 2 draft');
    expect(readingLabel({ tool: 'search_lore', args: { query: 'ley' } })).toBe('Searching the lore for “ley”');
    expect(readingLabel({ tool: 'get_mystery', args: {} })).toBe('Looking something up');
  });

  it('should name a web search by its query and a page by its site and path', () => {
    expect(readingLabel({ tool: 'search_web', args: { query: 'how fortresses ration water' } })).toBe('Searching the web for “how fortresses ration water”');
    expect(lookupLabel('fetch_page', { url: 'https://www.example.com/survival/water/' })).toBe('Web page: example.com/survival/water');
    expect(lookupLabel('fetch_page', { url: `https://example.com/${'a'.repeat(60)}` })).toBe(`Web page: example.com/${'a'.repeat(28)}…`);
    expect(lookupLabel('fetch_page', { url: 'not a url' })).toBe('A web page');
  });

  it('should keep the case of a Bible page’s own title', () => {
    expect(readingLabel({ tool: 'get_bible_document', args: { slug: 'vex' } })).toBe('Reading Vex');
  });
});

const html = (element: React.ReactElement): string => renderToStaticMarkup(element);

describe('TurnTrace', () => {
  it('should make a row with sources a collapsed disclosure and a row without one plain text', () => {
    const view = turnTimeline(play([...READ, [delta(), 10_000]]), 11_000, 'auto');
    const out = html(createElement(TurnTrace, { rows: [...view.trace, { key: 'save', label: 'Saving 1 change to your Story Bible', sources: [] }] }));

    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('Read your notes and 2 Bible pages');
    expect(out).toContain('Saving 1 change to your Story Bible');
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
    expect(out).not.toContain('Thought');
    expect(out.match(/<button/g)).toHaveLength(1);
  });

  it('should render nothing without rows', () => {
    expect(html(createElement(TurnTrace, { rows: [] }))).toBe('');
  });
});

describe('TurnLiveTail', () => {
  const tail = (elapsed: string | null, slow = false) => ({ label: 'Thinking', elapsed, starting: elapsed === null, slow });

  it('should put what the turn is doing and how long it has run on one line', () => {
    const out = html(createElement(TurnLiveTail, { tail: tail('24s') }));

    const line = out.slice(0, out.indexOf('</div>'));

    expect(line.indexOf('Thinking')).toBeLessThan(line.indexOf('· 24s'));
    expect(line.indexOf('Thinking')).toBeGreaterThan(-1);
    expect(html(createElement(TurnLiveTail, { tail: tail(null) }))).not.toContain('·');
  });

  it('should announce the turn once in a status line, and name a slow one visibly', () => {
    const working = html(createElement(TurnLiveTail, { tail: tail('12s') }));
    const slow = html(createElement(TurnLiveTail, { tail: tail('46s', true) }));

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
          [delta(' More.'), 1200],
        ]),
        mode: 'auto',
        now: 5000,
      }),
    );

    expect(out.indexOf('More.')).toBeLessThan(out.indexOf('Saving 1 change to your Story Bible'));
    expect(out.indexOf('Saving 1 change to your Story Bible')).toBeLessThan(out.indexOf('Writing'));
    expect(out.indexOf('Writing')).toBeLessThan(out.indexOf('· 5s'));
  });

  it('should show a thinking turn as one line after the reply so far, not a row above it', () => {
    const out = html(
      createElement(StreamedTurn, { stream: play([...READ, [delta('Reading the rest first.'), 3000], [lookup('get_notes', 'ok', { from: 8 }), 4000]]), mode: 'auto', now: 24_000 }),
    );

    expect(out.match(/Thinking/g)).toHaveLength(1);
    expect(out.indexOf('Reading the rest first.')).toBeLessThan(out.indexOf('Thinking'));
    expect(out.indexOf('Thinking')).toBeLessThan(out.indexOf('· 24s'));
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
