import { describe, expect, it } from 'bun:test';

import { isRetiredScreen, PROJECT_SCREENS, projectHomeRoute, SCREEN_LABEL, topBarCrumbs } from '../src/components/Layout/screens';

describe('PROJECT_SCREENS', () => {
  it('should list the sidebar in the canvas order, chat first (Main.dc.html l.52-62)', () => {
    expect(PROJECT_SCREENS.map(screen => screen.segment)).toEqual([
      'chat',
      'overview',
      'story-bible',
      'chapters',
      'review',
      'illustrations',
      'runs',
      'publish',
      'usage',
      'settings',
    ]);
  });

  it('should keep only Project Settings below the divider', () => {
    expect(PROJECT_SCREENS.filter(screen => screen.trailing).map(screen => screen.segment)).toEqual(['settings']);
  });
});

describe('projectHomeRoute', () => {
  it('should open a new novel on its chat', () => {
    expect(projectHomeRoute('new_novel')).toBe('/novels/$novelId/chat');
  });

  it('should land on a screen the sidebar lists', () => {
    expect(PROJECT_SCREENS.some(screen => screen.to === projectHomeRoute('new_novel'))).toBe(true);
  });
});

describe('isRetiredScreen', () => {
  it('should send the Blueprint and the other kinds’ old homes to the project home', () => {
    for (const splat of ['blueprint', 'blueprint/premise', 'blueprint/gate', 'volumes', 'import-plan', 'transform', 'translation', 'rebrand', 'reforge', 'source']) {
      expect({ splat, retired: isRetiredScreen(splat) }).toEqual({ splat, retired: true });
    }
  });

  it('should leave unknown and live screens to their own routes', () => {
    for (const splat of [undefined, '', 'nonsense', 'chat', 'overview', 'blueprints', 'x/blueprint']) {
      expect({ splat, retired: isRetiredScreen(splat) }).toEqual({ splat, retired: false });
    }
  });
});

describe('SCREEN_LABEL', () => {
  it('should label every declared screen', () => {
    expect(SCREEN_LABEL.get('chapters')).toBe('Chapters');
    expect(SCREEN_LABEL.get('chat')).toBe('Chat');
    expect(SCREEN_LABEL.get('usage')).toBe('Usage & charges');
  });
});

describe('topBarCrumbs', () => {
  it('should read the novel and the screen inside a project, as “The Tide Ledger / Chat” (Main.dc.html l.68)', () => {
    expect(topBarCrumbs({ pathname: '/novels/288/chat', inProject: true, projectName: 'The Tide Ledger' })).toEqual({ root: 'The Tide Ledger', leaf: 'Chat' });
  });

  it('should drop the leaf on a path that names no screen', () => {
    expect(topBarCrumbs({ pathname: '/novels/288', inProject: true, projectName: 'The Tide Ledger' })).toEqual({ root: 'The Tide Ledger' });
  });

  it('should fall back to the account crumb until the project loads, and outside a project', () => {
    expect(topBarCrumbs({ pathname: '/novels/288/chat', inProject: true })).toEqual({ root: 'Projects', leaf: 'Chat' });
    expect(topBarCrumbs({ pathname: '/usage', inProject: false })).toEqual({ root: 'Usage & charges' });
    expect(topBarCrumbs({ pathname: '/settings', inProject: false })).toEqual({ root: 'Settings' });
    expect(topBarCrumbs({ pathname: '/', inProject: false })).toEqual({ root: 'Projects' });
  });
});
