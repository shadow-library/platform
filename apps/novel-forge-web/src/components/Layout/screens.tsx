import { type ReactNode } from 'react';

import { BookIcon, ChatIcon, EditIcon, ImageIcon, OverviewIcon, ReviewIcon, RunsIcon, SendIcon, SettingsIcon, UsageIcon } from '../icons';
import { type ProjectRoute } from './routes';

export interface ProjectScreen {
  /** The last path segment — what the breadcrumb reads off the location. */
  segment: string;
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
  /** Sits below the nav divider rather than in the main run. */
  trailing?: boolean;
  /**
   * Requires the `novel-forge:admin` permission — a session concern. It only hides the nav entry: the
   * screen's own route must gate itself with `resolveIsAdmin`, the way `runs.tsx` does.
   */
  adminOnly?: boolean;
}

/**
 * Every project-scoped screen, declared once. The sidebar nav, the breadcrumb's leaf label, and the
 * command palette all derive from this list rather than keeping their own copies, which used to drift.
 */
export const PROJECT_SCREENS: ProjectScreen[] = [
  { segment: 'overview', to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon /> },
  { segment: 'story-bible', to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon /> },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon /> },
  { segment: 'illustrations', to: '/novels/$novelId/illustrations', label: 'Illustrations', icon: <ImageIcon /> },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon /> },
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon /> },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon />, adminOnly: true },
  { segment: 'publish', to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon /> },
  { segment: 'usage', to: '/novels/$novelId/usage', label: 'Usage & charges', icon: <UsageIcon /> },
  { segment: 'settings', to: '/novels/$novelId/settings', label: 'Project Settings', icon: <SettingsIcon />, trailing: true },
];

export const SCREEN_LABEL = new Map(PROJECT_SCREENS.map(screen => [screen.segment, screen.label]));

/** Where opening a project should land: the Workspace chat, the one authoring surface every project opens into. */
export function projectHomeRoute(): ProjectRoute {
  return '/novels/$novelId/chat';
}
