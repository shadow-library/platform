import { describe, expect, it } from 'bun:test';

import { TemplateEngineService } from '@modules/template';

const engine = new TemplateEngineService();

const LAYOUT = `<html><head><style>.wrap{background:#fff}.btn{color:#4f46e5}</style></head><body><div class="wrap"><header>{{ brand }}</header>{{ content | raw }}<footer>&copy; Shadow</footer></div></body></html>`;
const PARTIALS = {
  'otp-block': '<div class="otp">{{ code }}</div>',
  button: '<a class="btn" href="{{ href }}">{{ label }}</a>',
};

describe('TemplateEngineService', () => {
  it('should render an EMAIL by composing content into a layout with partials and inlining CSS', async () => {
    const out = await engine.render({
      channel: 'EMAIL',
      subject: 'Your code {{ code }}',
      body: `<h1>{{ heading }}</h1>{% render 'otp-block', code: code %}`,
      layout: LAYOUT,
      partials: PARTIALS,
      data: { heading: 'Sign in', code: '482913', brand: 'Shadow' },
    });
    expect(out.subject).toBe('Your code 482913');
    expect(out.body).toContain('<h1>Sign in</h1>');
    expect(out.body).toContain('<div class="otp">482913</div>');
    expect(out.body).toContain('Shadow'); // layout header rendered
    expect(out.body).toMatch(/<div class="wrap"[^>]*style="[^"]*background/i);
  });

  it('should auto-escape recipient/payload data in HTML to prevent injection', async () => {
    const out = await engine.render({
      channel: 'EMAIL',
      subject: null,
      body: '<p>{{ name }}</p>',
      layout: null,
      data: { name: '<script>alert(1)</script>' },
    });
    expect(out.body).not.toContain('<script>');
    expect(out.body).toContain('&lt;script&gt;');
  });

  it('should render SMS as plain text without HTML-escaping', async () => {
    const out = await engine.render({ channel: 'SMS', subject: null, body: '{{ code }} is your code — expires soon', data: { code: '482913' } });
    expect(out.subject).toBeNull();
    expect(out.body).toBe('482913 is your code — expires soon');
  });

  it('should render a PUSH title + body', async () => {
    const out = await engine.render({ channel: 'PUSH', subject: 'Alert for {{ name }}', body: 'Hi {{ name }}', data: { name: 'Alex' } });
    expect(out.subject).toBe('Alert for Alex');
    expect(out.body).toBe('Hi Alex');
  });

  it('should throw on an undeclared/undefined variable (strict mode)', async () => {
    await expect(engine.render({ channel: 'EMAIL', subject: null, body: '<p>{{ missing }}</p>', layout: null, data: {} })).rejects.toThrow();
  });

  it('should throw when a referenced partial is not provided', async () => {
    await expect(engine.render({ channel: 'EMAIL', subject: null, body: `{% render 'ghost' %}`, layout: null, partials: {}, data: {} })).rejects.toThrow();
  });
});
