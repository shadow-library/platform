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
    expect(panelToggleLabel('Story seed', 'expanded')).toBe('Collapse the Story seed panel');
    expect(panelToggleLabel('Story seed', 'collapsed')).toBe('Expand the Story seed panel');
  });
});
