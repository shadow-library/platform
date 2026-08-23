import { type ReactNode } from 'react';

import {
  BookIcon,
  ChatIcon,
  EditIcon,
  GlobeIcon,
  ImageIcon,
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

export interface ProjectScreen {
  /** The last path segment — what the breadcrumb reads off the location. */
  segment: string;
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
  /** Only meaningful for a project imported from an existing work. */
  sourceOnly?: boolean;
  /** Only meaningful for a project being written from scratch. */
  newNovelOnly?: boolean;
  /** Sits below the nav divider rather than in the main run. */
  trailing?: boolean;
}

/**
 * Every project-scoped screen, declared once. The sidebar nav, the breadcrumb's leaf label, and the
 * command palette all derive from this list — they used to keep their own copies, and had already
 * drifted (the palette was missing Rebrand and Reforge entirely).
 */
export const PROJECT_SCREENS: ProjectScreen[] = [
  { segment: 'overview', to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon /> },
  { segment: 'source', to: '/novels/$novelId/source', label: 'Source Pipeline', icon: <SourceIcon />, sourceOnly: true },
  { segment: 'rebrand', to: '/novels/$novelId/rebrand', label: 'Rebrand', icon: <GlobeIcon />, sourceOnly: true },
  { segment: 'reforge', to: '/novels/$novelId/reforge', label: 'Reforge', icon: <SparkIcon />, sourceOnly: true },
  { segment: 'transform', to: '/novels/$novelId/transform', label: 'Transform', icon: <ScissorsIcon />, sourceOnly: true },
  { segment: 'story-bible', to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon /> },
  { segment: 'canon-facts', to: '/novels/$novelId/canon-facts', label: 'Canon Facts', icon: <LockIcon /> },
  { segment: 'volumes', to: '/novels/$novelId/volumes', label: 'Volumes & Arcs', icon: <ListIcon /> },
  { segment: 'import-plan', to: '/novels/$novelId/import-plan', label: 'Import Plan (deprecated)', icon: <UploadIcon />, newNovelOnly: true },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon /> },
  { segment: 'illustrations', to: '/novels/$novelId/illustrations', label: 'Illustrations', icon: <ImageIcon /> },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon /> },
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon /> },
  { segment: 'proposals', to: '/novels/$novelId/proposals', label: 'Proposals', icon: <ProposalsIcon /> },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon /> },
  { segment: 'publish', to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon /> },
  { segment: 'settings', to: '/novels/$novelId/settings', label: 'Project Settings', icon: <SettingsIcon />, trailing: true },
];

export const SCREEN_LABEL = new Map(PROJECT_SCREENS.map(screen => [screen.segment, screen.label]));

export function screensForKind(kind?: string): ProjectScreen[] {
  return PROJECT_SCREENS.filter(screen => (!screen.sourceOnly || kind === 'source') && (!screen.newNovelOnly || kind === 'new_novel'));
}
