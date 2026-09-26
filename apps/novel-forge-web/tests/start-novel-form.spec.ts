import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StartNovelForm, type StartNovelFormProps } from '../src/features/projects/NewNovelModal';
import { countNoteWords, NOTES_OVER_WORDS } from '../src/lib/start-novel';

const noop = (): void => undefined;

function form(overrides: Partial<StartNovelFormProps> = {}): string {
  const notes = overrides.notes ?? '';
  const props: StartNovelFormProps = {
    formId: 'start',
    title: '',
    notes,
    notesWords: countNoteWords(notes),
    contentMode: 'standard',
    errors: {},
    pending: false,
    onTitleChange: noop,
    onNotesChange: noop,
    onContentModeChange: noop,
    onSubmit: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(StartNovelForm, props));
}

describe('StartNovelForm', () => {
  it('should start empty with the word limit stated and no errors', () => {
    const html = form();
    expect(html).toContain('Up to 10,000 words');
    expect(html).not.toContain('role="alert"');
  });

  it('should show the live word count of the notes', () => {
    expect(form({ notes: 'The sea refuses a payment.' })).toContain('5 words · 9,995 left');
  });

  it('should keep the live count outside the alert and announce only a static sentence when over the limit', () => {
    const html = form({ notes: 'x', notesWords: 10_001 });
    expect(html).toContain('10,001 words · 1 over');
    expect(html).toMatch(new RegExp(`<span role="alert"[^>]*> ${NOTES_OVER_WORDS}</span>`));
    expect(html).toContain('aria-invalid="true"');
  });

  it('should show a notes error from the server in place of the count', () => {
    const html = form({ notes: 'x', errors: { notes: 'Your notes are over 100,000 characters.' } });
    expect(html).toContain('Your notes are over 100,000 characters.');
    expect(html).not.toContain('9,999 left');
  });

  it('should show a title error on the title field', () => {
    const html = form({ errors: { title: 'Keep the title to 255 characters' } });
    expect(html).toContain('Keep the title to 255 characters');
    expect(html).toContain('aria-invalid="true"');
  });

  it('should show a focusable form-level error the fields cannot explain', () => {
    const html = form({ errors: { form: 'Project limit reached for this account' } });
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('Couldn’t start the novel');
    expect(html).toContain('Project limit reached for this account');
  });

  it('should be a real form so Enter in the title submits it', () => {
    const html = form();
    expect(html).toContain('<form id="start"');
    expect(html).toContain('placeholder="Untitled novel"');
  });

  it('should mark the working name optional in the canvas’s words', () => {
    const html = form();
    expect(html).toContain('Working name');
    expect(html).toContain('Optional — you can rename it any time.');
  });

  it('should show content mode inline, labelled by its visible label', () => {
    const html = form({ contentMode: 'unrestricted' });
    expect(html).toContain('<span id="start-content-mode">Content mode</span>');
    expect(html).toMatch(/role="radiogroup"[^>]*aria-labelledby="start-content-mode"|aria-labelledby="start-content-mode"[^>]*role="radiogroup"/);
    expect(html).toContain('You can switch it per chapter on its plan.');
    expect(html).not.toContain('aria-expanded');
  });

  it('should hold the fields while the novel is being created', () => {
    expect(form({ pending: true }).match(/readOnly=""/g)).toHaveLength(2);
  });

  it('should not offer an import link that the canvas does not draw', () => {
    expect(form()).not.toContain('/import');
  });
});
