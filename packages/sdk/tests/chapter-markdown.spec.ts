import { describe, expect, it } from 'bun:test';

import { renderChapterMarkdown } from '@shadow-library/sdk';

function collapse(html: string): string {
  return html.replace(/\n/g, '');
}

describe('renderChapterMarkdown', () => {
  it('should render GFM prose with single newlines as line breaks', () => {
    expect(collapse(renderChapterMarkdown('She *ran*.\nThe pier was **empty**.\n\n***\n\n> A quote\n\n- one\n- two\n\n## Later'))).toBe(
      '<p>She <em>ran</em>.<br>The pier was <strong>empty</strong>.</p><hr><blockquote><p>A quote</p></blockquote><ul><li>one</li><li>two</li></ul><h2>Later</h2>',
    );
  });

  it('should render nothing for empty content', () => {
    expect(renderChapterMarkdown('')).toBe('');
  });

  it('should treat CRLF content like LF content', () => {
    const lf = 'line one\nline two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(renderChapterMarkdown(lf.replace(/\n/g, '\r\n'))).toBe(renderChapterMarkdown(lf));
  });

  it.each([
    ['an inline script', 'Hello <script>alert(1)</script> world', '<p>Hello &lt;script&gt;alert(1)&lt;/script&gt; world</p>'],
    ['a block script', '<script>alert(1)</script>', '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'],
    ['an image with an error handler', '<img src=x onerror=alert(1)>', '<p>&lt;img src=x onerror=alert(1)&gt;</p>'],
    ['an angle-bracketed skill name', '<Fireball> has been learned.', '<p>&lt;Fireball&gt; has been learned.</p>'],
    ['an HTML comment', '<!-- hidden -->', '<p>&lt;!-- hidden --&gt;</p>'],
  ])('should escape raw HTML as literal text: %s', (_, markdown, html) => {
    expect(collapse(renderChapterMarkdown(markdown))).toBe(html);
  });

  it('should keep Markdown working around escaped HTML in a block', () => {
    expect(collapse(renderChapterMarkdown('<div>\n**bold**\n</div>'))).toBe('<p>&lt;div&gt;<br><strong>bold</strong></p><p>&lt;/div&gt;</p>');
  });

  it('should escape code the way Markdown does', () => {
    expect(collapse(renderChapterMarkdown('```js\n</code><script>\n```\n\n`<b>`'))).toBe(
      '<pre><code class="language-js">&lt;/code&gt;&lt;script&gt;</code></pre><p><code>&lt;b&gt;</code></p>',
    );
  });

  it('should link only http, https and mailto targets, opening them away from the chapter', () => {
    const html = renderChapterMarkdown('[web](https://example.com/a?b="c") [mail](mailto:a@b.co) www.example.com');
    expect(html).toContain('<a href="https://example.com/a?b=%22c%22" target="_blank" rel="noopener noreferrer nofollow">web</a>');
    expect(html).toContain('<a href="mailto:a@b.co" target="_blank" rel="noopener noreferrer nofollow">mail</a>');
    expect(html).toContain('<a href="http://www.example.com/" target="_blank" rel="noopener noreferrer nofollow">www.example.com</a>');
  });

  it.each([
    ['a javascript link', '[click](javascript:alert(1))'],
    ['a mixed-case javascript link', '[click](JaVaScRiPt:alert(1))'],
    ['a data link', '[click](data:text/html,<script>alert(1)</script>)'],
    ['a vbscript link', '[click](vbscript:msgbox)'],
    ['a relative link', '[click](/account)'],
    ['a javascript reference link', '[x]: javascript:alert(1)\n\n[click][x]'],
  ])('should render %s as its text alone', (_, markdown) => {
    expect(collapse(renderChapterMarkdown(markdown))).toBe('<p>click</p>');
  });

  it('should render a javascript autolink as escaped text', () => {
    expect(collapse(renderChapterMarkdown('<javascript:alert(1)>'))).toBe('<p>javascript:alert(1)</p>');
  });

  it('should render an image as its escaped alt text, never an img tag', () => {
    const html = renderChapterMarkdown('![a <b>map</b>](https://example.com/map.png) ![x](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(collapse(html)).toBe('<p>a &lt;b&gt;map&lt;/b&gt; x</p>');
  });

  it('should wrap every table for horizontal scrolling, keeping header cells and alignment', () => {
    const html = collapse(renderChapterMarkdown('| Skill | Level |\n| --- | ---: |\n| Mechanics | 1 |'));
    expect(html).toBe(
      '<div class="chapter-table"><table><thead><tr><th>Skill</th><th align="right">Level</th></tr></thead><tbody><tr><td>Mechanics</td><td align="right">1</td></tr></tbody></table></div>',
    );
  });

  it('should render a system fence as a titled panel whose body is Markdown, tables included', () => {
    const markdown = [
      'She blinked.',
      '',
      '```system Character Attributes',
      '| Attribute | Value |',
      '| --- | --- |',
      '| Strength | 14 |',
      '',
      '**New skill unlocked:** Basic Mechanics (Lv 1)',
      '```',
      '',
      'The window faded.',
    ].join('\n');
    expect(collapse(renderChapterMarkdown(markdown))).toBe(
      '<p>She blinked.</p>' +
        '<aside class="chapter-system" aria-label="Character Attributes"><div class="chapter-system__title">Character Attributes</div><div class="chapter-system__body">' +
        '<div class="chapter-table"><table><thead><tr><th>Attribute</th><th>Value</th></tr></thead><tbody><tr><td>Strength</td><td>14</td></tr></tbody></table></div>' +
        '<p><strong>New skill unlocked:</strong> Basic Mechanics (Lv 1)</p>' +
        '</div></aside>' +
        '<p>The window faded.</p>',
    );
  });

  it.each([
    ['no title', '```system\nQuest accepted.\n```'],
    ['a blank title', '```system   \nQuest accepted.\n```'],
    ['a tilde fence', '~~~system\nQuest accepted.\n~~~'],
  ])('should title a panel with %s "System"', (_, markdown) => {
    expect(collapse(renderChapterMarkdown(markdown))).toBe(
      '<aside class="chapter-system" aria-label="System"><div class="chapter-system__title">System</div><div class="chapter-system__body"><p>Quest accepted.</p></div></aside>',
    );
  });

  it('should escape an injected panel title in both the label and the title bar', () => {
    const html = renderChapterMarkdown('```system "><img src=x onerror=alert(1)>\nbody\n```');
    expect(html).not.toContain('<img');
    expect(html).toContain('aria-label="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
    expect(html).toContain('<div class="chapter-system__title">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</div>');
  });

  it('should escape HTML and drop unsafe links inside a panel', () => {
    const html = collapse(renderChapterMarkdown('```system Notice\n<script>alert(1)</script>\n[claim](javascript:alert(1)) ![x](https://example.com/x.png)\n```'));
    expect(html).toContain('<div class="chapter-system__body"><p>&lt;script&gt;alert(1)&lt;/script&gt;<br>claim x</p></div>');
  });

  it('should render a fence nested in a panel as an escaped code block, never a second panel', () => {
    const html = collapse(renderChapterMarkdown('````system Outer\n```system Inner\n<b>x</b>\n```\n````'));
    expect(html).toBe(
      '<aside class="chapter-system" aria-label="Outer"><div class="chapter-system__title">Outer</div><div class="chapter-system__body">' +
        '<pre><code class="language-system">&lt;b&gt;x&lt;/b&gt;</code></pre></div></aside>',
    );
  });

  it('should run an unclosed system fence to the end of the chapter, still rendered as Markdown', () => {
    expect(collapse(renderChapterMarkdown('Before.\n\n```system Open\nnever *closed*\n\nmore'))).toBe(
      '<p>Before.</p><aside class="chapter-system" aria-label="Open"><div class="chapter-system__title">Open</div><div class="chapter-system__body"><p>never <em>closed</em></p><p>more</p></div></aside>',
    );
  });

  it('should leave a fence whose info string only starts with system as a code block', () => {
    expect(collapse(renderChapterMarkdown('```systems\nx\n```'))).toBe('<pre><code class="language-systems">x</code></pre>');
  });
});
