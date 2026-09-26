import { describe, expect, it } from 'bun:test';

import { PROJECT_SCREENS, projectHomeRoute, SCREEN_LABEL } from '../src/components/Layout/screens';

describe('PROJECT_SCREENS', () => {
  it('should list the full authoring sidebar', () => {
    expect(PROJECT_SCREENS.map(screen => screen.segment)).toEqual([
      'overview',
      'story-bible',
      'chapters',
      'illustrations',
      'review',
      'chat',
      'runs',
      'publish',
      'usage',
      'settings',
    ]);
  });
});

describe('projectHomeRoute', () => {
  it('should open every project on the Workspace chat', () => {
    expect(projectHomeRoute()).toBe('/novels/$novelId/chat');
  });
});

describe('SCREEN_LABEL', () => {
  it('should label every declared screen', () => {
    expect(SCREEN_LABEL.get('chapters')).toBe('Chapters');
    expect(SCREEN_LABEL.get('chat')).toBe('Refinement Chat');
    expect(SCREEN_LABEL.get('usage')).toBe('Usage & charges');
  });
});
