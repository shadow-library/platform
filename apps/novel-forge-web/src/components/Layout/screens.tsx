import { type ReactNode } from 'react';

import { type BlueprintStage, type ProjectKind } from '@/lib/apis';

import { BookIcon, ChatIcon, ConceptIcon, EditIcon, ImageIcon, ListIcon, OverviewIcon, ReviewIcon, RunsIcon, SendIcon, SettingsIcon, UploadIcon } from '../icons';
import { type ProjectRoute } from './routes';

const WORKFLOWS: ProjectKind[] = ['new_novel'];

export interface ProjectScreen {
  /** The last path segment — what the breadcrumb reads off the location. */
  segment: string;
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
  /** Which project workflows show this screen. */
  workflows: ProjectKind[];
  /** Sits below the nav divider rather than in the main run. */
  trailing?: boolean;
  /**
   * Requires the `novel-forge:admin` permission regardless of workflow — a session concern, not a project-kind
   * one, so it is a field callers compose with `workflows` rather than a case folded into it. It only hides
   * the nav entry: the screen's own route must gate itself with `resolveIsAdmin`, the way `runs.tsx` does.
   */
  adminOnly?: boolean;
  /**
   * Stays reachable by URL and still counts toward `screenVisible` and `SCREEN_LABEL`, but is left out of
   * the sidebar nav and the command palette by `screensForWorkflow` — for a screen kept alive as a direct
   * link rather than a promoted destination.
   */
  hidden?: boolean;
}

/**
 * Every project-scoped screen, declared once. The sidebar nav, the breadcrumb's leaf label, and the
 * command palette all derive from this list rather than keeping their own copies, which used to drift.
 */
export const PROJECT_SCREENS: ProjectScreen[] = [
  { segment: 'overview', to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon />, workflows: WORKFLOWS },
  { segment: 'blueprint', to: '/novels/$novelId/blueprint', label: 'Blueprint', icon: <ConceptIcon />, workflows: WORKFLOWS },
  { segment: 'story-bible', to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon />, workflows: WORKFLOWS },
  { segment: 'volumes', to: '/novels/$novelId/volumes', label: 'Volumes & Arcs', icon: <ListIcon />, workflows: WORKFLOWS },
  { segment: 'import-plan', to: '/novels/$novelId/import-plan', label: 'Import Plan', icon: <UploadIcon />, workflows: WORKFLOWS, hidden: true },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon />, workflows: WORKFLOWS },
  { segment: 'illustrations', to: '/novels/$novelId/illustrations', label: 'Illustrations', icon: <ImageIcon />, workflows: WORKFLOWS },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon />, workflows: WORKFLOWS },
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon />, workflows: WORKFLOWS },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon />, workflows: WORKFLOWS, adminOnly: true },
  { segment: 'publish', to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon />, workflows: WORKFLOWS },
  { segment: 'settings', to: '/novels/$novelId/settings', label: 'Project Settings', icon: <SettingsIcon />, workflows: WORKFLOWS, trailing: true },
];

export const SCREEN_LABEL = new Map(PROJECT_SCREENS.map(screen => [screen.segment, screen.label]));

/** Every non-hidden screen while the project's kind is still loading, otherwise the ones its workflow shows. */
export function screensForWorkflow(kind?: ProjectKind): ProjectScreen[] {
  const screens = kind ? PROJECT_SCREENS.filter(screen => screen.workflows.includes(kind)) : PROJECT_SCREENS;
  return screens.filter(screen => !screen.hidden);
}

/** Whether `segment` is a screen shown for `kind` — an unlisted segment (not one of `PROJECT_SCREENS`) is never hidden by this check. */
export function screenVisible(segment: string, kind?: ProjectKind): boolean {
  const screen = PROJECT_SCREENS.find(candidate => candidate.segment === segment);
  return !screen || kind === undefined || screen.workflows.includes(kind);
}

/**
 * Where opening a project should land. A novel still in its Blueprint has no Overview worth showing: the
 * Blueprint is its home until the gate opens. `stage` has no default on purpose — a caller that does not
 * know it cannot pick a home, and should send the author through `/novels/$novelId`, which resolves it.
 */
export function projectHomeRoute(stage: BlueprintStage | null): ProjectRoute {
  if (stage === 'blueprint') return '/novels/$novelId/blueprint';
  return '/novels/$novelId/overview';
}
