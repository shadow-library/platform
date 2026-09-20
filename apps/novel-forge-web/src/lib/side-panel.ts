export type PanelState = 'expanded' | 'collapsed';

export function toPanelState(collapsed: boolean): PanelState {
  return collapsed ? 'collapsed' : 'expanded';
}

export function togglePanelState(state: PanelState): PanelState {
  return state === 'expanded' ? 'collapsed' : 'expanded';
}

/** Names the state the press moves to, not the state the panel is in, and carries what the panel holds — the collapsed rail shows that count to sighted readers, so it has to be said too. */
export function panelToggleLabel(title: string, state: PanelState, summary?: string): string {
  const action = state === 'expanded' ? 'Collapse' : 'Expand';
  return summary ? `${action} the ${title} panel — ${summary}` : `${action} the ${title} panel`;
}
