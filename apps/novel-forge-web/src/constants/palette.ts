/**
 * Novel Forge semantic accent palette.
 *
 * The brand primary (teal) lives in the Ant Design theme; these are the
 * cross-cutting accents the wireframes lean on — AI touchpoints, continuity
 * conflicts, and canon state — kept here so every screen speaks the same language.
 */

export const nf = {
  teal: '#009e98',
  tealBg: '#e2f4f2',
  tealBorder: '#8fcfc9',

  /** AI-generated / human-in-the-loop touchpoints */
  ai: '#b5613a',
  aiBg: '#fbeee7',
  aiBorder: '#e6b49c',

  /** Continuity conflicts / destructive-ish warnings */
  conflict: '#df7c56',

  /** Approved canon */
  canon: '#2f7d52',
  canonBg: '#e6f2ea',
  canonBorder: '#9dcbaf',
} as const;
