import { type ReactNode } from 'react';

import { type ProjectKind } from '@/lib/apis';

import {
  BookIcon,
  ChatIcon,
  EditIcon,
  GlobeIcon,
  ImageIcon,
  LanguageIcon,
  ListIcon,
  LockIcon,
  OverviewIcon,
  ProposalsIcon,
  ReviewIcon,
  RunsIcon,
  ScissorsIcon,
  SendIcon,
  SettingsIcon,
  SourceIcon,
  SparkIcon,
  UploadIcon,
} from '../icons';
import { type ProjectRoute } from './routes';

const ALL_WORKFLOWS: ProjectKind[] = ['new_novel', 'source', 'translation', 'curated'];
const AUTHORING: ProjectKind[] = ['new_novel', 'source'];

export interface ProjectScreen {
  /** The last path segment — what the breadcrumb reads off the location. */
  segment: string;
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
  /** Which project workflows show this screen — see D10 in the translation-pipeline design doc. */
  workflows: ProjectKind[];
  /** Sits below the nav divider rather than in the main run. */
  trailing?: boolean;
  /**
   * Requires the `novel-forge:admin` scope regardless of workflow — a session concern, not a project-kind
   * one, so it is a field callers compose with `workflows` rather than a case folded into it (see D7 in
   * rail-stop-admin-design.md). `screensForWorkflow` stays workflow-only; a caller that also cares about
   * admin-gating filters this field itself, the way `AppShell` does.
   */
  adminOnly?: boolean;
}

/**
 * Every project-scoped screen, declared once. The sidebar nav, the breadcrumb's leaf label, and the
 * command palette all derive from this list — they used to keep their own copies, and had already
 * drifted (the palette was missing Rebrand and Reforge entirely).
 */
export const PROJECT_SCREENS: ProjectScreen[] = [
  { segment: 'overview', to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon />, workflows: ALL_WORKFLOWS },
  { segment: 'translation', to: '/novels/$novelId/translation', label: 'Translation', icon: <LanguageIcon />, workflows: ['translation'] },
  { segment: 'source', to: '/novels/$novelId/source', label: 'Source Pipeline', icon: <SourceIcon />, workflows: ['source'] },
  { segment: 'rebrand', to: '/novels/$novelId/rebrand', label: 'Rebrand', icon: <GlobeIcon />, workflows: ['source'] },
  { segment: 'reforge', to: '/novels/$novelId/reforge', label: 'Reforge', icon: <SparkIcon />, workflows: ['source'] },
  { segment: 'transform', to: '/novels/$novelId/transform', label: 'Transform', icon: <ScissorsIcon />, workflows: ['source'] },
  { segment: 'story-bible', to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon />, workflows: AUTHORING },
  { segment: 'canon-facts', to: '/novels/$novelId/canon-facts', label: 'Canon Facts', icon: <LockIcon />, workflows: AUTHORING },
  { segment: 'volumes', to: '/novels/$novelId/volumes', label: 'Volumes & Arcs', icon: <ListIcon />, workflows: AUTHORING },
  { segment: 'import-plan', to: '/novels/$novelId/import-plan', label: 'Import Plan (deprecated)', icon: <UploadIcon />, workflows: ['new_novel'] },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon />, workflows: ['new_novel', 'source', 'curated'] },
  { segment: 'illustrations', to: '/novels/$novelId/illustrations', label: 'Illustrations', icon: <ImageIcon />, workflows: ALL_WORKFLOWS },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon />, workflows: AUTHORING },
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon />, workflows: AUTHORING },
  { segment: 'proposals', to: '/novels/$novelId/proposals', label: 'Proposals', icon: <ProposalsIcon />, workflows: AUTHORING },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon />, workflows: ALL_WORKFLOWS, adminOnly: true },
  { segment: 'publish', to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon />, workflows: ALL_WORKFLOWS },
  { segment: 'settings', to: '/novels/$novelId/settings', label: 'Project Settings', icon: <SettingsIcon />, workflows: ALL_WORKFLOWS, trailing: true },
];

export const SCREEN_LABEL = new Map(PROJECT_SCREENS.map(screen => [screen.segment, screen.label]));

/** All screens while the project's kind is still loading, otherwise the ones its workflow shows. */
export function screensForWorkflow(kind?: ProjectKind): ProjectScreen[] {
  if (!kind) return PROJECT_SCREENS;
  return PROJECT_SCREENS.filter(screen => screen.workflows.includes(kind));
}

/** Whether `segment` is a screen shown for `kind` — an unlisted segment (not one of `PROJECT_SCREENS`) is never hidden by this check. */
export function screenVisible(segment: string, kind?: ProjectKind): boolean {
  const screen = PROJECT_SCREENS.find(candidate => candidate.segment === segment);
  return !screen || kind === undefined || screen.workflows.includes(kind);
}

/** Where a freshly created project should land — the workflow's own screen when it has one, else Overview. */
export function projectHomeRoute(kind: ProjectKind): ProjectRoute {
  return kind === 'translation' ? '/novels/$novelId/translation' : '/novels/$novelId/overview';
}
