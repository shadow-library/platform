import { describe, expect, it } from 'bun:test';

import { panelToggleLabel, togglePanelState, toPanelState } from '../src/lib/side-panel';

describe('toPanelState', () => {
  it('should read a collapsed flag as a state', () => {
    expect(toPanelState(true)).toBe('collapsed');
    expect(toPanelState(false)).toBe('expanded');
  });
});

describe('togglePanelState', () => {
  it('should move between the two states', () => {
    expect(togglePanelState('expanded')).toBe('collapsed');
    expect(togglePanelState('collapsed')).toBe('expanded');
  });

  it('should return to where it started after two presses', () => {
    expect(togglePanelState(togglePanelState('expanded'))).toBe('expanded');
  });
});

describe('panelToggleLabel', () => {
  it('should name the state the press moves to', () => {
    expect(panelToggleLabel('Story bible', 'expanded')).toBe('Collapse the Story bible panel');
    expect(panelToggleLabel('Story bible', 'collapsed')).toBe('Expand the Story bible panel');
  });

  it('should announce what a collapsed panel is hiding', () => {
    expect(panelToggleLabel('Changes in this chat', 'collapsed', '2 waiting, 5 changed')).toBe('Expand the Changes in this chat panel — 2 waiting, 5 changed');
  });

  it('should leave the name alone when there is nothing to summarise', () => {
    expect(panelToggleLabel('Story bible', 'collapsed', '')).toBe('Expand the Story bible panel');
  });
});
