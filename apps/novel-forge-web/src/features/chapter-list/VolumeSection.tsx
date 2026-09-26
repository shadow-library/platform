import { type ReactNode } from 'react';
import { Button } from '@shadow-library/ui';

import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
import { type ChipIntent, StatusChip } from '@/components/nf';
import { type ChapterGroup, groupPages, pageCountOf, pageRangeLabel, volumeMeta, volumeStateLabel } from '@/lib/chapter-list';
import { type VolumeState } from '@/lib/apis';

import styles from './VolumeSection.module.css';

const STATE_INTENT: Record<VolumeState, ChipIntent> = { goal_met: 'success', active: 'accent', not_started: 'neutral' };

export interface GoalMetAction {
  label: string;
  onClick: () => void;
}

export interface VolumeSectionProps {
  group: ChapterGroup;
  open: boolean;
  onToggle: () => void;
  page: number;
  onPage: (page: number) => void;
  goalMet?: GoalMetAction;
  children: ReactNode;
}

export function VolumeList({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className={styles.volumes}>{children}</div>;
}

export function VolumeNote({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className={styles.note}>{children}</p>;
}

function Pager({ group, page, onPage }: Pick<VolumeSectionProps, 'group' | 'page' | 'onPage'>): React.JSX.Element | null {
  if (pageCountOf(group) < 2) return null;
  const label = group.number ? `Volume ${group.number} pages` : 'Chapter pages';
  return (
    <div className={styles.pager}>
      <span className={styles.range}>{pageRangeLabel(group, page)}</span>
      <nav aria-label={label} className={styles.pages}>
        {groupPages(group).map(option => (
          <Button
            key={option.page}
            variant={option.page === page ? 'primary' : 'secondary'}
            aria-current={option.page === page ? 'page' : undefined}
            onClick={() => onPage(option.page)}
          >
            {option.label}
          </Button>
        ))}
      </nav>
    </div>
  );
}

export function VolumeSection({ group, open, onToggle, page, onPage, goalMet, children }: VolumeSectionProps): React.JSX.Element {
  const volume = group.volume;
  if (!volume) {
    return (
      <section aria-label="Chapters" className={styles.section}>
        {children}
        <Pager group={group} page={page} onPage={onPage} />
      </section>
    );
  }

  const title = volume.title ?? `Volume ${group.number}`;
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section aria-label={`Volume ${group.number} — ${title}`} className={styles.section} data-writing={volume.state === 'active' || undefined}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <Chevron size={12} className={styles.chevron} />
        <span className={styles.headMain}>
          <span className={styles.headLine}>
            <span className={styles.eyebrow}>VOLUME {group.number}</span>
            <span className={styles.volumeTitle}>{title}</span>
            <StatusChip intent={STATE_INTENT[volume.state]}>{volumeStateLabel(volume.state)}</StatusChip>
          </span>
          {volume.objective && <span className={styles.goal}>Goal: {volume.objective}</span>}
        </span>
        <span className={styles.meta}>{volumeMeta(group)}</span>
      </button>
      {open && (
        <>
          {children}
          <Pager group={group} page={page} onPage={onPage} />
          {goalMet && (
            <div className={styles.writing}>
              Volumes have no fixed length — this one ends when its goal is met.
              <Button variant="secondary" className={styles.writingAction} onClick={goalMet.onClick}>
                {goalMet.label}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
