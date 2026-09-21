import { describe, expect, it } from 'bun:test';

import { PROJECT_SCREENS, SCREEN_LABEL, screensForWorkflow, screenVisible } from '../src/components/Layout/screens';

function segmentsFor(kind?: 'source' | 'new_novel' | 'translation' | 'curated'): string[] {
  return screensForWorkflow(kind).map(screen => screen.segment);
}

describe('screensForWorkflow', () => {
  it('should return every non-hidden screen while the project kind is still loading', () => {
    expect(screensForWorkflow(undefined)).toEqual(PROJECT_SCREENS.filter(screen => !screen.hidden));
  });

  it('should never include a hidden screen while the project kind is still loading', () => {
    expect(screensForWorkflow(undefined).some(screen => screen.hidden)).toBe(false);
  });

  it('should show the full authoring sidebar for a new_novel project, without the hidden Import Plan entry', () => {
    expect(segmentsFor('new_novel')).toEqual(['overview', 'story-bible', 'canon-facts', 'volumes', 'chapters', 'illustrations', 'review', 'chat', 'runs', 'publish', 'settings']);
  });

  it('should show the source pipeline screens and hide Import Plan for a source project', () => {
    const segments = segmentsFor('source');
    expect(segments).toEqual([
      'overview',
      'source',
      'rebrand',
      'reforge',
      'transform',
      'story-bible',
      'canon-facts',
      'volumes',
      'chapters',
      'illustrations',
      'review',
      'chat',
      'runs',
      'publish',
      'settings',
    ]);
  });

  it('should show only Overview, Translation, Illustrations, Workflow Runs, Publish and Settings for a translation project', () => {
    expect(segmentsFor('translation')).toEqual(['overview', 'translation', 'illustrations', 'runs', 'publish', 'settings']);
  });

  it('should show Overview, Chapters, Illustrations, Workflow Runs, Publish and Settings for a curated project, with no authoring screens', () => {
    expect(segmentsFor('curated')).toEqual(['overview', 'chapters', 'illustrations', 'runs', 'publish', 'settings']);
  });
});

describe('screenVisible', () => {
  it('should treat every screen as visible while the kind is unknown', () => {
    expect(screenVisible('story-bible', undefined)).toBe(true);
    expect(screenVisible('translation', undefined)).toBe(true);
  });

  it('should hide a workflow-specific screen from the wrong workflow', () => {
    expect(screenVisible('story-bible', 'translation')).toBe(false);
    expect(screenVisible('translation', 'new_novel')).toBe(false);
    expect(screenVisible('source', 'curated')).toBe(false);
  });

  it('should show a screen that lists the given workflow', () => {
    expect(screenVisible('overview', 'curated')).toBe(true);
    expect(screenVisible('chapters', 'curated')).toBe(true);
    expect(screenVisible('translation', 'translation')).toBe(true);
  });

  it('should never hide a segment that is not one of the declared project screens', () => {
    expect(screenVisible('not-a-real-screen', 'translation')).toBe(true);
  });

  it('should keep the hidden Import Plan screen reachable by URL for a new_novel project', () => {
    expect(screenVisible('import-plan', 'new_novel')).toBe(true);
  });

  it('should still hide Import Plan by URL for workflows that never had it', () => {
    expect(screenVisible('import-plan', 'source')).toBe(false);
    expect(screenVisible('import-plan', 'translation')).toBe(false);
    expect(screenVisible('import-plan', 'curated')).toBe(false);
  });
});

describe('SCREEN_LABEL', () => {
  it('should label the hidden Import Plan screen without a deprecated suffix', () => {
    expect(SCREEN_LABEL.get('import-plan')).toBe('Import Plan');
  });
});
