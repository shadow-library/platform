export const SHELL_DESKTOP_MIN = 768;
export const CHAT_THREAD_WIDTH = 768;
export const CHAT_THREAD_PADDING = 24;
export const PROGRESS_PANEL_WIDTH = 320;
export const SIDEBAR_WIDTH = 254;
export const SIDEBAR_RAIL_WIDTH = 56;

export const PANEL_DOCK_MIN = CHAT_THREAD_WIDTH + 2 * CHAT_THREAD_PADDING + PROGRESS_PANEL_WIDTH;
export const SIDEBAR_EXPANDED_MIN = PANEL_DOCK_MIN + SIDEBAR_WIDTH;
export const SIDEBAR_RAIL_QUERY = `(max-width: ${SIDEBAR_EXPANDED_MIN - 1}px)`;

export type ViewportBand = 'wide' | 'narrow';

export interface SidebarRail {
  band: ViewportBand;
  /** The author's own toggle, held only within the band it was made in. */
  choice?: boolean;
}

export function sidebarRailAt(rail: SidebarRail, band: ViewportBand): SidebarRail {
  if (rail.band === band) return rail;
  return { band };
}

export function isSidebarCollapsed(rail: SidebarRail): boolean {
  return rail.choice ?? rail.band === 'narrow';
}
