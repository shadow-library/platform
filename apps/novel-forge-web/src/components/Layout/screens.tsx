import { type ReactNode } from 'react';

import { type ProjectKind } from '@/lib/apis';

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
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Chat', icon: <ChatIcon /> },
  { segment: 'overview', to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon /> },
  { segment: 'story-bible', to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon /> },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon /> },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon /> },
  { segment: 'illustrations', to: '/novels/$novelId/illustrations', label: 'Illustrations', icon: <ImageIcon /> },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon />, adminOnly: true },
  { segment: 'publish', to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon /> },
  { segment: 'usage', to: '/novels/$novelId/usage', label: 'Usage & charges', icon: <UsageIcon /> },
  { segment: 'settings', to: '/novels/$novelId/settings', label: 'Project Settings', icon: <SettingsIcon />, trailing: true },
];

export const SCREEN_LABEL = new Map(PROJECT_SCREENS.map(screen => [screen.segment, screen.label]));

const ACCOUNT_CRUMBS: Record<string, string> = { '/settings': 'Settings', '/usage': 'Usage & charges' };

export interface TopBarCrumbs {
  root: string;
  /** The screen inside a project; the phone top bar drops it and keeps the novel's title (Phone.dc.html l.35). */
  leaf?: string;
}

export interface TopBarLocation {
  pathname: string;
  inProject: boolean;
  projectName?: string;
}

export function topBarCrumbs({ pathname, inProject, projectName }: TopBarLocation): TopBarCrumbs {
  const leafSegment = pathname.split('/').filter(Boolean).at(-1);
  const leaf = !inProject || leafSegment == null ? undefined : SCREEN_LABEL.get(leafSegment);
  const root = inProject && projectName != null ? projectName : (ACCOUNT_CRUMBS[pathname] ?? 'Projects');
  return leaf == null ? { root } : { root, leaf };
}

const PROJECT_HOME: Record<ProjectKind, ProjectRoute> = { new_novel: '/novels/$novelId/chat' };

export function projectHomeRoute(kind: ProjectKind): ProjectRoute {
  return PROJECT_HOME[kind];
}

/** Screens removed with the other project kinds and the Blueprint; an old link to one opens the project's home. */
const RETIRED_SEGMENTS = new Set(['blueprint', 'volumes', 'import-plan', 'transform', 'translation', 'rebrand', 'reforge', 'source']);

export function isRetiredScreen(splat: string | undefined): boolean {
  const segment = splat?.split('/').find(Boolean);
  return segment != null && RETIRED_SEGMENTS.has(segment);
}
