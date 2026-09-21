import { describe, expect, it } from 'bun:test';

import { extractHeadings } from '../src/lib/markdown-outline';

describe('extractHeadings', () => {
  it('should collect every heading level in source order', () => {
    const markdown = '# Lock Law\n\nIntro text.\n\n## Tolls\n\nBody.\n\n### Exceptions\n\nMore body.';
    expect(extractHeadings(markdown)).toEqual([
      { level: 1, text: 'Lock Law' },
      { level: 2, text: 'Tolls' },
      { level: 3, text: 'Exceptions' },
    ]);
  });

  it('should return nothing for a document with no headings', () => {
    expect(extractHeadings('Just prose, no structure.')).toEqual([]);
  });

  it('should not treat a mid-line "#" as a heading', () => {
    expect(extractHeadings('The channel #3 marker moved.')).toEqual([]);
  });

  it('should trim trailing whitespace from heading text', () => {
    expect(extractHeadings('#   Heading with padding   \nBody.')).toEqual([{ level: 1, text: 'Heading with padding' }]);
  });

  it('should skip a "#" comment inside a fenced code block', () => {
    const markdown = '# Title\n\n```\ncode\n# not a heading\n```\n\n## Real heading';
    expect(extractHeadings(markdown)).toEqual([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Real heading' },
    ]);
  });

  it('should skip a tilde-fenced code block the same way', () => {
    const markdown = '~~~\n# not a heading\n~~~\n\n# Real heading';
    expect(extractHeadings(markdown)).toEqual([{ level: 1, text: 'Real heading' }]);
  });

  it('should not let a mismatched fence marker close an open fence', () => {
    const markdown = '```\n~~~\n# still fenced\n```\n# after the fence';
    expect(extractHeadings(markdown)).toEqual([{ level: 1, text: 'after the fence' }]);
  });

  it('should treat an unterminated fence as open through the end of the document', () => {
    const markdown = '# Before\n\n```\n# inside, unterminated\n';
    expect(extractHeadings(markdown)).toEqual([{ level: 1, text: 'Before' }]);
  });
});
