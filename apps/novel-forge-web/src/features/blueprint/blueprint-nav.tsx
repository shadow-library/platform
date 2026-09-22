import { type ReactElement } from 'react';
import { Tooltip } from '@shadow-library/ui';
import { type NavSection } from '@shadow-library/ui/router';

import { BookIcon, CheckIcon, EditIcon, ListIcon, LockIcon, OverviewIcon, SettingsIcon } from '@/components/icons';
import { type BlueprintPhaseProgressResponse, type BlueprintPhaseStatus } from '@/lib/apis';

import { applicableSteps, groupPhasesByAltitude } from './blueprint-phases';
import { blueprintStepMeta } from './blueprint-steps';
import styles from './blueprint.module.css';

function PhaseMark({ status }: { status: BlueprintPhaseStatus }): ReactElement {
  if (status === 'done')
    return (
      <span className={styles.mark} data-state="done">
        <CheckIcon size={11} />
      </span>
    );
  if (status === 'locked')
    return (
      <span className={styles.mark} data-state="locked">
        <LockIcon size={11} />
      </span>
    );
  return <span className={styles.mark} data-state={status} />;
}

// The name starts with the visible word so it satisfies label-in-name; the reason is the tooltip's
// description, which Radix links with aria-describedby, so it is announced once rather than twice.
function LockReason({ phaseLabel, reason }: { phaseLabel: string; reason: string }): ReactElement {
  return (
    <Tooltip content={reason}>
      <button type="button" className={styles.lockWhy} aria-label={`Why ${phaseLabel} is locked`}>
        why?
      </button>
    </Tooltip>
  );
}

/**
 * The Blueprint rail: the seven phases grouped by altitude, each one a disclosure over the steps that
 * apply to this novel. A locked phase keeps its mark and its reason but offers no steps — there is nothing
 * behind it to open yet.
 */
export function blueprintNavSections(novelId: string, phases: BlueprintPhaseProgressResponse[]): NavSection[] {
  const altitudes = groupPhasesByAltitude(phases).map<NavSection>(group => ({
    label: group.altitude,
    items: group.phases.map(phase => ({
      label: phase.label,
      icon: <PhaseMark status={phase.status} />,
      action: phase.status === 'locked' && phase.lockReason != null ? <LockReason phaseLabel={phase.label} reason={phase.lockReason} /> : undefined,
      defaultOpen: phase.status === 'current',
      items:
        phase.status === 'locked'
          ? []
          : applicableSteps(phase).map(step => ({
              to: '/novels/$novelId/blueprint/$step',
              params: { novelId, step: step.key },
              id: step.key,
              label: blueprintStepMeta(step.key).label,
              icon: step.done ? <CheckIcon size={12} /> : undefined,
            })),
    })),
  }));

  return [
    ...altitudes,
    {
      label: 'Your novel',
      items: [
        { to: '/novels/$novelId/story-bible', params: { novelId }, label: 'Story Bible', icon: <BookIcon /> },
        { to: '/novels/$novelId/volumes', params: { novelId }, label: 'Volumes & Arcs', icon: <ListIcon /> },
        { to: '/novels/$novelId/chapters', params: { novelId }, label: 'Chapters', icon: <EditIcon /> },
      ],
    },
    // Overview is not part of the Blueprint — while the Blueprint is open it is the overview — but it is the
    // one way back for a Workspace screen reached by URL in this stage (Import Plan right after a project is
    // created, a bookmarked Review Queue), which would otherwise be a dead end.
    {
      items: [
        { to: '/novels/$novelId/overview', params: { novelId }, label: 'Overview', icon: <OverviewIcon /> },
        { to: '/novels/$novelId/settings', params: { novelId }, label: 'Project Settings', icon: <SettingsIcon /> },
      ],
    },
  ];
}
