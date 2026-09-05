import { describe, expect, it } from 'bun:test';
import { type WindowLike } from 'dompurify';
import { JSDOM } from 'jsdom';

import { createHtmlSanitizer } from '../src/components/nf/sanitize-html';

describe('createHtmlSanitizer (server pass via jsdom)', () => {
  const sanitize = createHtmlSanitizer(new JSDOM('').window as unknown as WindowLike);

  it('should strip a script tag from server-rendered HTML', () => {
    const out = sanitize('<p>hello</p><script>alert(1)</script>');
    expect(out).toContain('<p>hello</p>');
    expect(out).not.toContain('<script>');
  });

  it('should strip event-handler attributes', () => {
    const out = sanitize('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('should drop a javascript: href', () => {
    const out = sanitize('<a href="javascript:alert(1)">link</a>');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('link');
  });

  it('should preserve the safe formatting marked produces', () => {
    const out = sanitize('<h1>Title</h1><strong>bold</strong><a href="https://example.com">l</a>');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('href="https://example.com"');
  });
});
