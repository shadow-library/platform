import { describe, expect, it } from 'bun:test';

import { PROJECT_SCREENS, projectHomeRoute, SCREEN_LABEL, screensForWorkflow, screenVisible } from '../src/components/Layout/screens';

function segmentsFor(kind?: 'new_novel'): string[] {
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
    expect(segmentsFor('new_novel')).toEqual(['overview', 'blueprint', 'story-bible', 'volumes', 'chapters', 'illustrations', 'review', 'chat', 'runs', 'publish', 'settings']);
  });
});

describe('screenVisible', () => {
  it('should treat every screen as visible while the kind is unknown', () => {
    expect(screenVisible('story-bible', undefined)).toBe(true);
    expect(screenVisible('blueprint', undefined)).toBe(true);
  });

  it('should show every screen for the only workflow this app has', () => {
    expect(screenVisible('story-bible', 'new_novel')).toBe(true);
    expect(screenVisible('blueprint', 'new_novel')).toBe(true);
    expect(screenVisible('overview', 'new_novel')).toBe(true);
    expect(screenVisible('chapters', 'new_novel')).toBe(true);
  });

  it('should never hide a segment that is not one of the declared project screens', () => {
    expect(screenVisible('not-a-real-screen', 'new_novel')).toBe(true);
  });

  it('should keep the hidden Import Plan screen reachable by URL for a new_novel project', () => {
    expect(screenVisible('import-plan', 'new_novel')).toBe(true);
  });
});

describe('projectHomeRoute', () => {
  it('should open a novel still in its Blueprint on the Blueprint', () => {
    expect(projectHomeRoute('blueprint')).toBe('/novels/$novelId/blueprint');
  });

  it('should open a novel that has passed the gate on Overview', () => {
    expect(projectHomeRoute('workspace')).toBe('/novels/$novelId/overview');
    expect(projectHomeRoute(null)).toBe('/novels/$novelId/overview');
  });
});

describe('SCREEN_LABEL', () => {
  it('should label the hidden Import Plan screen without a deprecated suffix', () => {
    expect(SCREEN_LABEL.get('import-plan')).toBe('Import Plan');
  });
});
