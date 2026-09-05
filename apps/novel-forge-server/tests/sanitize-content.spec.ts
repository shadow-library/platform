import { describe, expect, it } from 'bun:test';

import { sanitizeMarkdown } from '@server/common';

const LEGITIMATE_MARKDOWN = [
  '# Chapter One',
  '',
  'He said **stop** and _turned_ away, ~~again~~.',
  '',
  '> A quoted line.',
  '> Still quoted, with a [safe link](https://example.com).',
  '',
  '- one',
  '- two',
  '  - nested item',
  '',
  '1. first',
  '2. second',
  '',
  'Inline `code with <div>` plus a comparison 5 < 10 and a brand AT&T.',
  '',
  'An autolink <https://example.com> and an image ![alt](https://example.com/i.png).',
  '',
  '```html',
  '<script>alert(1)</script>',
  '<iframe src="x"></iframe>',
  '```',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
].join('\n');

describe('sanitizeMarkdown', () => {
  it('should leave legitimate Markdown byte-for-byte unchanged', () => {
    expect(sanitizeMarkdown(LEGITIMATE_MARKDOWN)).toBe(LEGITIMATE_MARKDOWN);
  });

  it('should escape a raw <script> block into inert text', () => {
    const out = sanitizeMarkdown('Intro.\n\n<script>alert(1)</script>\n');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('should neutralize an onerror handler by escaping its tag', () => {
    const out = sanitizeMarkdown('Look <img src=x onerror=alert(1)> here.\n');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('should escape a raw <iframe>', () => {
    const out = sanitizeMarkdown('<iframe src="https://evil"></iframe>\n');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('&lt;iframe');
  });

  it('should drop a javascript: link but keep its visible text', () => {
    const out = sanitizeMarkdown('Try [click me](javascript:alert(1)) now.\n');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('click me');
  });

  it('should match a dangerous scheme case-insensitively and past whitespace obfuscation', () => {
    expect(sanitizeMarkdown('[x](JaVaScRiPt:alert(1))\n')).toBe('x\n');
  });

  it('should drop a data: link', () => {
    expect(sanitizeMarkdown('[x](data:text/html;base64,PHN2Zz4=)\n')).toBe('x\n');
  });

  it('should drop an entity-encoded scheme the browser would decode in an href', () => {
    expect(sanitizeMarkdown('[x](javascript&colon;alert(1))\n')).toBe('x\n');
    expect(sanitizeMarkdown('[x](java&#115;cript:alert(1))\n')).toBe('x\n');
    expect(sanitizeMarkdown('[x](javascript&#x3a;alert(1))\n')).toBe('x\n');
  });

  it('should not drop a safe URL whose query carries an entity', () => {
    const md = 'See [x](https://example.com?a=1&amp;b=2) here.\n';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  it('should neutralize a reference-style dangerous link to its text', () => {
    const out = sanitizeMarkdown('[click][ev]\n\n[ev]: javascript:alert(1)\n');
    expect(out).toContain('click');
    expect(out).not.toContain('[click][ev]');
    expect(out).not.toContain('[click]');
  });

  it('should leave raw HTML in a marker-stripped blockquote untouched (render-time sanitizer is the backstop)', () => {
    const md = '> intro text here\n> and <img src=x onerror=alert(1)> tail\n';
    expect(sanitizeMarkdown(md)).toBe(md);
  });

  it('should preserve inline code containing a tag while escaping a real one beside it', () => {
    const out = sanitizeMarkdown('Use `<b>` in code, but escape <b onclick=x>this</b>.\n');
    expect(out).toContain('`<b>`');
    expect(out).not.toContain('<b onclick');
    expect(out).toContain('&lt;b onclick=x&gt;');
  });

  it('should return empty and nullish input unchanged', () => {
    expect(sanitizeMarkdown('')).toBe('');
    expect(sanitizeMarkdown(null)).toBe(null);
    expect(sanitizeMarkdown(undefined)).toBe(undefined);
  });
});
