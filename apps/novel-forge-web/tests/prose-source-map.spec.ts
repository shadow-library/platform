import { describe, expect, it } from 'bun:test';
import { marked } from 'marked';

import { renderedSelection } from '../src/lib/passage-suggestions';
import { alignRendered, proseSourceMap, sourceRangeOf } from '../src/lib/prose-source-map';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", copy: '©' };

/** What the reader's DOM holds as `textContent`: the rendered HTML with its tags dropped and its entities decoded. */
function domTextOf(markdown: string): string {
  const html = marked.parse(markdown, { gfm: true, breaks: true, async: false }) as string;
  return html.replace(/<[^>]+>/g, '').replace(/&(#?[a-z0-9]+);/gi, (entity, name: string) => ENTITIES[name] ?? entity);
}

/** Selects the `occurrence`th appearance of `rendered` in the DOM text and maps it to the source it came from. */
function select(markdown: string, rendered: string, occurrence = 0): string | { kind: string } {
  const dom = domTextOf(markdown);
  let at = -1;
  for (let seen = 0; seen <= occurrence; seen++) at = dom.indexOf(rendered, at + 1);
  if (at === -1) throw new Error(`“${rendered}” is not in the DOM text “${dom}”`);
  const result = renderedSelection(markdown, { source: markdown, from: 0 }, dom, at, at + rendered.length);
  return result.kind === 'ok' ? markdown.slice(result.selection.start, result.selection.end) : { kind: result.kind };
}

describe('proseSourceMap', () => {
  it('should render the same text the reader shows, with each unit’s source span', () => {
    const map = proseSourceMap('A 5\\*3 &amp; *b*.');
    expect(map?.text).toBe('A 5*3 & b.');
    expect([map?.starts[3], map?.ends[3]]).toEqual([3, 5]);
    expect([map?.starts[6], map?.ends[6]]).toEqual([7, 12]);
  });

  it('should refuse CRLF text, which the lexer rewrites', () => {
    expect(proseSourceMap('one\r\ntwo')).toBeUndefined();
  });

  it('should pair the whitespace the DOM adds between blocks with nothing, and refuse a DOM that disagrees', () => {
    const map = proseSourceMap('One.\n\nTwo.');
    expect(map && alignRendered(map, 'One.\nTwo.\n')).toEqual([0, 1, 2, 3, -1, 4, 5, 6, 7, -1]);
    expect(map && alignRendered(map, 'One. Three.')).toBeUndefined();
  });
});

describe('reader selections', () => {
  it('should anchor an escaped character to its escape', () => {
    expect(select('The sum 5\\*3 is fifteen.', '5*3')).toBe('5\\*3');
  });

  it('should keep intra-word emphasis whole, widening a span that cuts it', () => {
    expect(select('It was un*believ*able, truly.', 'unbelievable')).toBe('un*believ*able');
    expect(select('It was un*believ*able, truly.', 'believ')).toBe('believ');
    expect(select('It was un*believ*able, truly.', 'unbeliev')).toBe('un*believ*');
    expect(select('It was *truly unbelievable*, she said.', 'unbelievable, she')).toBe('*truly unbelievable*, she');
  });

  it('should widen nested emphasis to whole tokens and never split its markers', () => {
    expect(select('A **bold _nested_ words** end.', 'bold nested')).toBe('bold _nested_');
    expect(select('A **bold _nested_ words** end.', 'nested words')).toBe('_nested_ words');
    expect(select('A **bold _nested_ words** end.', 'words end')).toBe('**bold _nested_ words** end');
  });

  it('should refuse a span that cuts through a link, code span, autolink or inline HTML', () => {
    const cuts = { kind: 'cuts-markup' };
    expect(select('See [the harbour](http://x.io/the) wall.', 'harbour wall')).toEqual(cuts);
    expect(select('Go [to the](u) harbour **now** ok', 'the harbour now')).toEqual(cuts);
    expect(select('See [txt][r] now\n\n[r]: http://x.io', 'txt now')).toEqual(cuts);
    expect(select('Use `the code` now', 'code now')).toEqual(cuts);
    expect(select('Use `` a`b `` now', 'a`b now')).toEqual(cuts);
    expect(select('<https://a.io/x> today', 'x today')).toEqual(cuts);
    expect(select('A <b>bold</b> word', 'bold word')).toEqual(cuts);
  });

  it('should accept a link, code span or element taken whole, or words strictly inside it', () => {
    expect(select('See [the harbour](http://x.io/the) wall.', 'See the harbour wall')).toBe('See [the harbour](http://x.io/the) wall');
    expect(select('See [the harbour](http://x.io/the) wall.', 'harbour')).toBe('harbour');
    expect(select('Use `the code` now', 'Use the code now')).toBe('Use `the code` now');
    expect(select('A <b>bold</b> word', 'A bold word')).toBe('A <b>bold</b> word');
  });

  it('should refuse a span that crosses list items, so no list marker is pulled in', () => {
    expect(select('- alpha\n- beta gamma\n- delta', 'gamma\ndelta')).toEqual({ kind: 'cuts-markup' });
    expect(select('- alpha\n- beta gamma\n- delta', 'gamma')).toBe('gamma');
  });

  it('should anchor a decoded entity to the whole entity', () => {
    expect(select('Tom &amp; Jerry went out.', '& Jerry')).toBe('&amp; Jerry');
  });

  it('should find the right one of two identical passages, not the first', () => {
    const markdown = 'No tick.\n\nThen nothing.\n\nNo tick.';
    expect(renderedSelection(markdown, { source: markdown, from: 0 }, domTextOf(markdown), 0, 8)).toEqual({
      kind: 'ok',
      selection: { start: 0, end: 8, text: 'No tick.' },
    });
    const second = domTextOf(markdown).lastIndexOf('No tick.');
    expect(renderedSelection(markdown, { source: markdown, from: 0 }, domTextOf(markdown), second, second + 8)).toEqual({
      kind: 'ok',
      selection: { start: 25, end: 33, text: 'No tick.' },
    });
  });

  it('should map across paragraphs and line breaks, and offset a later piece of the body by where it starts', () => {
    expect(select('Tin box.\n\nThe pages\nwere damp.', 'box.\nThe pages')).toBe('box.\n\nThe pages');
    const body = 'First piece.\n\nSecond *piece* here.';
    const piece = { source: body.slice(12), from: 12 };
    const dom = domTextOf(piece.source);
    const at = dom.indexOf('piece here');
    const result = renderedSelection(body, piece, dom, at, at + 'piece here'.length);
    expect(result.kind === 'ok' && result.selection.text).toBe('*piece* here');
  });

  it('should refuse a body with CRLF line endings', () => {
    expect(renderedSelection('a\r\nb', { source: 'a\r\nb', from: 0 }, 'a b', 0, 1)).toEqual({ kind: 'line-endings' });
  });

  it('should give nothing for a selection of only the whitespace between blocks', () => {
    const map = proseSourceMap('One.\n\nTwo.');
    expect(map && sourceRangeOf('One.\n\nTwo.', map, 'One.\nTwo.\n', 4, 5)).toEqual({ kind: 'empty' });
  });
});
