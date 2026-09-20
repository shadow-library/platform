export type PanelState = 'expanded' | 'collapsed';

export function toPanelState(collapsed: boolean): PanelState {
  return collapsed ? 'collapsed' : 'expanded';
}

export function togglePanelState(state: PanelState): PanelState {
  return state === 'expanded' ? 'collapsed' : 'expanded';
}

/** Names the state the press moves to, not the state the panel is in. */
export function panelToggleLabel(title: string, state: PanelState): string {
  return `${state === 'expanded' ? 'Collapse' : 'Expand'} the ${title} panel`;
}
