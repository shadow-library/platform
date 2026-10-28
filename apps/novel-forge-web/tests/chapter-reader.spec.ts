import { describe, expect, it } from 'bun:test';
import { marked } from 'marked';
import { proseParagraphs, renderChapterMarkdown } from '@shadow-library/sdk';

import { type ProposalResponse } from '../src/lib/apis';
import { bodyOffset, locateRewrite, numberedHtml, proposedPassages, readerSelection, readerSource, renderedSpans, sourceOffset } from '../src/lib/chapter-reader';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

function domTextOf(markdown: string): string {
  const html = marked.parse(markdown, { gfm: true, breaks: true, async: false }) as string;
  return html.replace(/<[^>]+>/g, '').replace(/&(#?[a-z0-9]+);/gi, (entity, name: string) => ENTITIES[name] ?? entity);
}

function readerDomText(view: ReturnType<typeof readerSource>): string {
  const html = numberedHtml(view, proseParagraphs(view.body), new Set());
  return html.replace(/<[^>]+>/g, '').replace(/&(#?[a-z0-9]+);/gi, (entity, name: string) => ENTITIES[name] ?? entity);
}

function numbers(body: string): string[] {
  return [...numberedHtml(readerSource(body, []), proseParagraphs(body), new Set()).matchAll(/<([a-z0-9]+) data-paragraph="(\d+)"/g)].map(match => `${match[1]}:${match[2]}`);
}

const BODY = 'The keeper counts the ships.\n\nThe tide turns late tonight. The ferry waits.\n\nGulls cry.';
const PASSAGE = 'The tide turns late tonight.';
const START = BODY.indexOf(PASSAGE);

const PANEL = '```system Character Attributes\n| Attribute | Value |\n| --- | --- |\n| Strength | 14 |\n\n**New skill:** Basic Mechanics\n```';
const TABLE = '| Item | Count |\n| --- | --- |\n| Rope | 2 |';
const SYSTEM_BODY = `The screen flickered.\n\n${PANEL}\n\nShe read it twice.\n\n${TABLE}\n\nThen she closed it.`;

describe('numberedHtml', () => {
  it('should number each block as the shared splitter does, never a scene break', () => {
    expect(numbers('# Chapter 3\nShe ran.\n* * *\nMorning came.')).toEqual(['h1:1', 'p:2', 'p:3']);
    expect(numbers('She said:\n- one\n- two\n\nAfter.')).toEqual(['p:1', 'ul:2', 'p:3']);
    expect(numbers('Before.\n\n```\nline one\n\nline two\n```\n\nAfter.')).toEqual(['p:1', 'pre:2', 'p:3']);
  });

  it('should give the number to the next element of a block whose first part renders no tag', () => {
    expect(numbers('<!-- note -->\nShe ran.\n\nAfter.')).toEqual(['p:1', 'p:2']);
  });

  it('should number a CRLF body by its own offsets', () => {
    expect(numbers('One.\r\n\r\nTwo\r\nlines.\r\n\r\nThree.')).toEqual(['p:1', 'p:2', 'p:3']);
  });

  it('should never show a number twice across pieces rendered apart', () => {
    const body = 'First.\n\nSecond.\n\nThird.';
    const paragraphs = proseParagraphs(body);
    const shown = new Set<number>();
    const first = numberedHtml(readerSource(body.slice(0, 16), []), paragraphs, shown);
    const again = numberedHtml(readerSource(body.slice(0, 16), []), paragraphs, shown);
    expect(first).toContain('data-paragraph="1"');
    expect(again).not.toContain('data-paragraph');
  });

  it('should render system panels and tables as the shared chapter renderer does, each numbered as one block', () => {
    const html = numberedHtml(readerSource(SYSTEM_BODY, []), proseParagraphs(SYSTEM_BODY), new Set());
    expect(html.replace(/ data-paragraph="\d+"/g, '')).toBe(renderChapterMarkdown(SYSTEM_BODY));
    expect(numbers(SYSTEM_BODY)).toEqual(['p:1', 'aside:2', 'p:3', 'div:4', 'p:5']);
    expect(html).toContain('<aside data-paragraph="2" class="chapter-system" aria-label="Character Attributes">');
  });

  it('should take a system fence in any case, and leave other fences as code', () => {
    expect(numberedHtml(readerSource('```SYSTEM\nLevel up\n```', []), [], new Set())).toContain('<div class="chapter-system__title">System</div>');
    expect(numberedHtml(readerSource('```systemic\nx\n```', []), [], new Set())).toContain('<code class="language-systemic">');
  });

  it('should run an unclosed system fence to the end as one panel', () => {
    expect(numbers('Before.\n\n```system Open\nStill open\n\nAnd more')).toEqual(['p:1', 'aside:2']);
  });

  it('should number a table that follows a paragraph line as part of that paragraph, as the shared splitter counts it', () => {
    const body = `Her pack held:\n${TABLE}\n\nAfter.`;
    expect(proseParagraphs(body)).toHaveLength(2);
    expect(numbers(body)).toEqual(['p:1', 'p:2']);
    expect(numberedHtml(readerSource(body, []), proseParagraphs(body), new Set())).toContain('<div class="chapter-table"><table>');
  });

  it('should number a CRLF body with a panel by its own offsets', () => {
    expect(numbers(SYSTEM_BODY.replace(/\n/g, '\r\n'))).toEqual(['p:1', 'aside:2', 'p:3', 'div:4', 'p:5']);
  });

  it('should keep the HTML the reader rendered before, only tagged', () => {
    const html = numberedHtml(readerSource(BODY, []), proseParagraphs(BODY), new Set());
    expect(html.replace(/ data-paragraph="\d+"/g, '')).toBe(marked.parse(BODY, { gfm: true, breaks: true, async: false }) as string);
  });
});

describe('readerSource', () => {
  it('should mark a pending rewrite in place and map offsets on either side of it back to the body', () => {
    const view = readerSource(BODY, [{ start: START, end: START + PASSAGE.length, replacement: 'The tide is late.' }]);
    expect(view.source).toContain('<del data-proposed>The tide turns late tonight.</del><ins data-proposed>The tide is late.</ins> The ferry');
    expect(bodyOffset(view, view.source.indexOf('The ferry'))).toBe(BODY.indexOf('The ferry'));
    expect(bodyOffset(view, view.source.indexOf('tide is late'))).toBeUndefined();
    expect(bodyOffset(view, view.source.indexOf('tide turns'))).toBe(BODY.indexOf('tide turns'));
    expect(sourceOffset(view, START, 'start')).toBe(view.source.indexOf(PASSAGE));
    expect(sourceOffset(view, START + PASSAGE.length, 'end')).toBe(view.source.indexOf(PASSAGE) + PASSAGE.length);
  });

  it('should strike each line after its block markers, and put a multi-paragraph replacement in as line breaks', () => {
    const body = '- one item\n- two item\n\nAfter.';
    const view = readerSource(body, [{ start: 2, end: body.indexOf('\n\n'), replacement: 'New one.\n\nNew two.' }]);
    expect(view.source).toBe('- <del data-proposed>one item</del>\n- <del data-proposed>two item</del><ins data-proposed>New one.<br><br>New two.</ins>\n\nAfter.');
  });

  it('should leave out a rewrite that overlaps an earlier one, touches code, or sits in a CRLF body', () => {
    const second = { start: START + 4, end: START + 10, replacement: 'x' };
    expect(readerSource(BODY, [{ start: START, end: START + PASSAGE.length, replacement: 'y' }, second]).insertions).toHaveLength(3);
    const code = 'Text.\n\n```\ncode here\n```';
    expect(readerSource(code, [{ start: code.indexOf('code'), end: code.indexOf('code') + 4, replacement: 'x' }]).source).toBe(code);
    expect(readerSource('A.\r\n\r\nB.', [{ start: 0, end: 2, replacement: 'x' }]).insertions).toEqual([]);
  });

  it('should leave out a rewrite that touches a system panel or a table, and keep one beside them', () => {
    const at = (text: string): { start: number; end: number; replacement: string } => ({
      start: SYSTEM_BODY.indexOf(text),
      end: SYSTEM_BODY.indexOf(text) + text.length,
      replacement: 'x',
    });
    expect(readerSource(SYSTEM_BODY, [at('Strength')]).source).toBe(SYSTEM_BODY);
    expect(readerSource(SYSTEM_BODY, [at('Rope')]).source).toBe(SYSTEM_BODY);
    expect(readerSource(SYSTEM_BODY, [at('flickered.\n\n```system')]).source).toBe(SYSTEM_BODY);
    expect(readerSource(SYSTEM_BODY, [at('read it twice')]).source).toContain('She <del data-proposed>read it twice</del><ins data-proposed>x</ins>.');
  });

  it('should keep the numbering of the body under a preview', () => {
    const view = readerSource(BODY, [{ start: START, end: START + PASSAGE.length, replacement: 'Late.' }]);
    const html = numberedHtml(view, proseParagraphs(BODY), new Set());
    expect([...html.matchAll(/data-paragraph="(\d+)"/g)].map(match => match[1])).toEqual(['1', '2', '3']);
  });
});

describe('readerSelection', () => {
  it('should map a selection back to the body through the preview and refuse one that touches the proposed text', () => {
    const view = readerSource(BODY, [{ start: START, end: START + PASSAGE.length, replacement: 'The tide is late.' }]);
    const dom = domTextOf(view.source);
    const at = dom.indexOf('ferry waits');
    expect(readerSelection(view, dom, at, at + 11, 2000)).toEqual({
      kind: 'ok',
      selection: { start: BODY.indexOf('ferry waits'), end: BODY.indexOf('ferry waits') + 11, text: 'ferry waits' },
    });
    const inside = dom.indexOf('turns late');
    expect(readerSelection(view, dom, inside, inside + 10, 2000)).toMatchObject({ kind: 'ok', selection: { text: 'turns late' } });
    const across = dom.indexOf('tonight.The tide is');
    expect(readerSelection(view, dom, across, across + 15, 2000).kind).toBe('cuts-markup');
    const proposed = dom.indexOf('is late');
    expect(readerSelection(view, dom, proposed, proposed + 7, 2000)).toEqual({ kind: 'in-preview' });
  });

  it('should take a system panel whole for a selection inside it or running into it', () => {
    const view = readerSource(SYSTEM_BODY, []);
    const dom = readerDomText(view);
    const inside = dom.indexOf('Strength');
    expect(readerSelection(view, dom, inside, inside + 8, 2000)).toMatchObject({ kind: 'ok', selection: { text: PANEL } });
    const title = dom.indexOf('Character Attributes');
    expect(readerSelection(view, dom, title, title + 9, 2000)).toMatchObject({ kind: 'ok', selection: { text: PANEL } });
    const from = dom.indexOf('flickered');
    expect(readerSelection(view, dom, from, dom.indexOf('Attribute'), 2000)).toMatchObject({
      kind: 'ok',
      selection: { start: SYSTEM_BODY.indexOf('flickered'), end: SYSTEM_BODY.indexOf(PANEL) + PANEL.length },
    });
    const after = dom.indexOf('read it');
    expect(readerSelection(view, dom, after, after + 7, 2000)).toMatchObject({ kind: 'ok', selection: { text: 'read it' } });
  });

  it('should map a selection inside a table cell to that cell', () => {
    const view = readerSource(SYSTEM_BODY, []);
    const dom = readerDomText(view);
    const rope = dom.indexOf('Rope');
    expect(readerSelection(view, dom, rope, rope + 4, 2000)).toEqual({
      kind: 'ok',
      selection: { start: SYSTEM_BODY.indexOf('Rope'), end: SYSTEM_BODY.indexOf('Rope') + 4, text: 'Rope' },
    });
  });

  it('should refuse a selection over the comment limit and any selection in a CRLF body', () => {
    const view = readerSource(BODY, []);
    const dom = domTextOf(BODY);
    expect(readerSelection(view, dom, 0, dom.length, 20)).toEqual({ kind: 'too-long' });
    expect(readerSelection(readerSource('A\r\nB', []), 'A\nB', 0, 1, 2000)).toEqual({ kind: 'line-endings' });
  });
});

describe('renderedSpans', () => {
  it('should find the DOM text of each body span, through a preview, and nothing for a span that does not show', () => {
    const view = readerSource(BODY, [{ start: START, end: START + PASSAGE.length, replacement: 'Late.' }]);
    const dom = domTextOf(view.source);
    const gulls = BODY.indexOf('Gulls');
    const [span, hidden] = renderedSpans(view, dom, [
      { start: gulls, end: gulls + 5 },
      { start: BODY.indexOf('\n\n'), end: BODY.indexOf('\n\n') + 2 },
    ]);
    expect(span && dom.slice(span.start, span.end)).toBe('Gulls');
    expect(hidden).toBeUndefined();
  });
});

describe('renderedSpans around system panels', () => {
  it('should mark every unit of a panel for a span over the whole fence, and none for a span inside it', () => {
    const view = readerSource(SYSTEM_BODY, []);
    const dom = readerDomText(view);
    const panel = SYSTEM_BODY.indexOf(PANEL);
    const strength = SYSTEM_BODY.indexOf('Strength');
    const [whole, part, prose] = renderedSpans(view, dom, [
      { start: panel, end: panel + PANEL.length },
      { start: strength, end: strength + 8 },
      { start: SYSTEM_BODY.indexOf('She read'), end: SYSTEM_BODY.indexOf('She read') + 8 },
    ]);
    expect(whole && dom.slice(whole.start, whole.end)).toStartWith('Character Attributes');
    expect(whole && dom.slice(whole.start, whole.end).trimEnd()).toEndWith('Basic Mechanics');
    expect(part).toBeUndefined();
    expect(prose && dom.slice(prose.start, prose.end)).toBe('She read');
  });
});

describe('proposedPassages', () => {
  const draft = { id: '7', chapter: 3, body: BODY };
  const anchor = { draftId: '7', start: START, end: START + PASSAGE.length, contextBefore: 'ships.\n\n', contextAfter: ' The ferry' };
  const op = { op: 'draft.rewrite_passage', chapter: 3, passage: PASSAGE, replacement: 'Late.', anchor };
  const proposal = (overrides: Partial<ProposalResponse> = {}): Pick<ProposalResponse, 'status' | 'changeSet' | 'opResults'> => ({
    status: 'pending',
    changeSet: [op],
    opResults: null,
    ...overrides,
  });

  it('should show a pending rewrite of this draft where it stands, moved or in place', () => {
    expect(proposedPassages([proposal()], draft)).toEqual([{ start: START, end: START + PASSAGE.length, replacement: 'Late.' }]);
    const moved = { ...draft, body: `Night falls.\n\n${BODY}` };
    expect(proposedPassages([proposal()], moved)).toEqual([{ start: START + 14, end: START + 14 + PASSAGE.length, replacement: 'Late.' }]);
  });

  it('should skip a settled card, another chapter or draft, an answered op and a passage no longer found', () => {
    expect(proposedPassages([proposal({ status: 'applied' })], draft)).toEqual([]);
    expect(proposedPassages([proposal({ changeSet: [{ ...op, chapter: 4 }] })], draft)).toEqual([]);
    expect(proposedPassages([proposal()], { ...draft, id: '8' })).toEqual([]);
    expect(proposedPassages([proposal({ opResults: [{ index: 0, status: 'declined' }] })], draft)).toEqual([]);
    expect(proposedPassages([proposal()], { ...draft, body: BODY.replace('late tonight', 'early') })).toEqual([]);
  });

  it('should not take a passage whose surroundings occur twice for the one the card was staged on', () => {
    expect(locateRewrite(`x${BODY}\n\n${BODY}`, '7', op)).toBeUndefined();
  });
});
