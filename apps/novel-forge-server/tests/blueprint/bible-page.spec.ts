import { describe, expect, it } from 'bun:test';

import { upsertPageSections } from '@modules/blueprint/steps/bible-page';

const PREMISE = '# Premise\n\nA clerk audits the dead.\n\n## Why\n\nBecause debt is memory.\n\n## What it means for the writer\n\nEvery clue is personal.';

describe('upsertPageSections', () => {
  it('should build a page from nothing', () => {
    const body = upsertPageSections(null, 'Premise', 'A clerk audits the dead.', [{ heading: 'Why', body: 'Because debt is memory.' }]);
    expect(body).toBe('# Premise\n\nA clerk audits the dead.\n\n## Why\n\nBecause debt is memory.');
  });

  it('should replace only the sections it is handed', () => {
    const body = upsertPageSections(PREMISE, 'Premise', null, [{ heading: 'Theme', body: 'What makes you you?' }]);
    expect(body).toContain('A clerk audits the dead.');
    expect(body).toContain('## Why\n\nBecause debt is memory.');
    expect(body).toContain('## Theme\n\nWhat makes you you?');
  });

  it('should keep a section another step wrote when the owning step rewrites its lead', () => {
    const withTheme = upsertPageSections(PREMISE, 'Premise', null, [{ heading: 'Theme', body: 'What makes you you?' }]);
    const relocked = upsertPageSections(withTheme, 'Premise', 'A diver salvages contracts.', [
      { heading: 'Why', body: 'A different why.' },
      { heading: 'What it means for the writer', body: 'A different line.' },
    ]);
    expect(relocked).toContain('A diver salvages contracts.');
    expect(relocked).toContain('## Theme\n\nWhat makes you you?');
    expect(relocked).not.toContain('Because debt is memory.');
  });

  it('should match a heading whatever its case and spacing', () => {
    const body = upsertPageSections(PREMISE, 'Premise', null, [{ heading: '  why  ', body: 'Rewritten.' }]);
    expect(body.match(/^## /gm)).toHaveLength(2);
    expect(body).toContain('Rewritten.');
  });

  it('should remove a section handed an empty body', () => {
    const body = upsertPageSections(PREMISE, 'Premise', null, [{ heading: 'Why', body: '' }]);
    expect(body).not.toContain('## Why');
    expect(body).toContain('## What it means for the writer');
  });

  it('should keep the existing lead when it is given none', () => {
    const body = upsertPageSections(PREMISE, 'Premise', null, []);
    expect(body).toBe(PREMISE);
  });

  it('should title a page it has to create without a lead', () => {
    expect(upsertPageSections(null, 'Reader promise', null, [{ heading: 'Promises to the reader', body: '- One' }])).toBe('# Reader promise\n\n## Promises to the reader\n\n- One');
  });
});
