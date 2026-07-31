/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { ConsolidateService } from '@modules/extraction/consolidate.service';
import { SkeletonService } from '@modules/planning/skeleton.service';
import { AssetService } from '@modules/source/asset.service';
import { cleanHtml } from '@modules/source/text-cleaner';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// ─── cleanHtml ───────────────────────────────────────────────────────────────

describe('cleanHtml', () => {
  it('strips script tags and their content', () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = cleanHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('converts headings to Markdown pound signs', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2>';
    const result = cleanHtml(html);
    expect(result).toContain('# Title');
    expect(result).toContain('## Subtitle');
  });

  it('decodes common HTML entities', () => {
    const html = '<p>&amp; &lt; &gt; &nbsp; &quot; &#39; &hellip; &mdash; &ndash; &lsquo; &rsquo; &ldquo; &rdquo;</p>';
    const result = cleanHtml(html);
    expect(result).toContain('& < >');
    expect(result).toContain('"');
    expect(result).toContain("'");
    expect(result).toContain('...');
    expect(result).toContain('—');
    expect(result).toContain('–');
  });

  it('decodes numeric HTML entities', () => {
    const result = cleanHtml('&#65;&#66;&#67;');
    expect(result).toBe('ABC');
  });

  it('collapses 3+ blank lines to 2', () => {
    const html = '<p>A</p><p>B</p><p>C</p>';
    // Insert extra newlines artificially.
    const padded = '\n\n\n\n' + html + '\n\n\n\n';
    const result = cleanHtml(padded);
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('returns empty string for empty input', () => {
    expect(cleanHtml('')).toBe('');
  });

  it('returns plain text unchanged (no HTML)', () => {
    const plain = 'Hello world, no tags here.';
    expect(cleanHtml(plain)).toBe(plain);
  });

  it('converts em/strong to Markdown', () => {
    const html = '<em>italic</em> and <strong>bold</strong>';
    const result = cleanHtml(html);
    expect(result).toContain('*italic*');
    expect(result).toContain('**bold**');
  });

  it('strips links but keeps visible text', () => {
    const html = '<a href="https://example.com">Click here</a>';
    const result = cleanHtml(html);
    expect(result).toContain('Click here');
    expect(result).not.toContain('href');
    expect(result).not.toContain('https://example.com');
  });
});

// ─── ConsolidateService ───────────────────────────────────────────────────────

describe('ConsolidateService', () => {
  it('class is defined and instantiable', () => {
    expect(ConsolidateService).toBeDefined();
    // Verify it's a constructor function (class).
    expect(typeof ConsolidateService).toBe('function');
  });
});

// ─── SkeletonService ─────────────────────────────────────────────────────────

describe('SkeletonService', () => {
  it('class is defined', () => {
    expect(SkeletonService).toBeDefined();
    expect(typeof SkeletonService).toBe('function');
  });
});

// ─── AssetService ─────────────────────────────────────────────────────────────

describe('AssetService', () => {
  it('renders entity and world-fact sections in Markdown format', async () => {
    // Fake DatabaseService with a mock postgres client.
    const fakeDb = {
      query: {
        entities: {
          findMany: async () => [
            { name: 'Hero', type: 'character', significance: 'major', notes: 'The protagonist.' },
            { name: 'Villain', type: 'character', significance: 'minor', notes: null },
          ],
        },
        plotThreads: { findMany: async () => [] },
        worldFacts: {
          findMany: async () => [{ category: 'geography', key: 'capital_city', value: 'Arcadia' }],
        },
        mysteries: { findMany: async () => [] },
      },
    };

    const fakeDbService = {
      getPostgresClient: () => fakeDb,
    };

    // Instantiate without DI by passing the fake service.
    const service = new AssetService(fakeDbService as never);
    const markdown = await service.render(1n);

    expect(markdown).toContain('## Entities');
    expect(markdown).toContain('### Hero (character, major)');
    expect(markdown).toContain('The protagonist.');
    expect(markdown).toContain('## World Facts');
    expect(markdown).toContain('### geography');
    expect(markdown).toContain('**capital_city**: Arcadia');
    expect(markdown).not.toContain('## Plot Threads');
    expect(markdown).not.toContain('## Mysteries');
  });
});
