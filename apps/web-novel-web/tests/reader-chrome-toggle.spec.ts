import { describe, expect, it } from 'bun:test';

import { togglesReaderChrome } from '@/lib/reader';

function chapterBody(): HTMLElement {
  const body = document.createElement('div');
  body.innerHTML =
    '<p id="prose">She ran <a id="link" href="https://example.com"><em id="link-text">here</em></a>.</p>' +
    '<div class="chapter-table"><table><tbody><tr><td id="cell">14</td></tr></tbody></table></div>' +
    '<pre><code id="code">x</code></pre>';
  return body;
}

describe('togglesReaderChrome', () => {
  it('should toggle the chrome for a tap on prose', () => {
    expect(togglesReaderChrome(chapterBody().querySelector('#prose'))).toBe(true);
  });

  it.each(['#link', '#link-text', '#cell', '#code'])('should leave the chrome alone for a tap inside %s', selector => {
    expect(togglesReaderChrome(chapterBody().querySelector(selector))).toBe(false);
  });

  it('should toggle the chrome when the event has no element target', () => {
    expect(togglesReaderChrome(null)).toBe(true);
  });
});
