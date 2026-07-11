/**
 * Importing npm packages
 */
import { Button, SegmentedControl } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/nf';
import { NewNovelModal } from '@/features/projects/NewNovelModal';
import { type ProjectKind, type ProjectResponse, useListProjectsQuery, useProjectStatusQuery } from '@/lib/apis';
import { imageUrl, projectKindLabel, projectKindTag, projectTitle, relativeTime } from '@/lib/format';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/')({
  component: Dashboard,
});

type Filter = 'all' | 'source' | 'new_novel';

interface StatProps {
  value?: number;
  total?: number;
  label: string;
}

function Stat({ value, total, label }: StatProps): React.JSX.Element {
  return (
    <div>
      <div className={styles.statValue}>
        {value ?? 0}
        {total != null && <span className={styles.statTotal}>/{total}</span>}
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectResponse;
}

function ProjectCard({ project }: ProjectCardProps): React.JSX.Element {
  const navigate = useNavigate();
  const statusQuery = useProjectStatusQuery(project.id);
  const status = statusQuery.data;
  const isSource = project.kind === 'source';
  const draftsDone = (status?.draftsTotal ?? 0) > 0 && status?.draftsFinal === status?.draftsTotal;
  const open = (): void => {
    navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } });
  };

  return (
    <div
      className={`nf-cardhover ${styles.card}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') open();
      }}
    >
      {project.coverImagePath ? (
        <img src={imageUrl(project.coverImagePath)} alt="" className={styles.cardCover} />
      ) : (
        <div className={styles.stripe} data-kind={project.kind} />
      )}
      <div className={styles.cardBody}>
        <div className={styles.chipRow}>
          <StatusChip intent={isSource ? 'info' : 'accent'}>{projectKindTag(project.kind)}</StatusChip>
        </div>
        <h3 className={styles.cardTitle}>{projectTitle(project)}</h3>
        <p className={styles.cardSub}>
          {projectKindLabel(project.kind)}
          {project.storyCurrentChapter ? ` · Chapter ${project.storyCurrentChapter}` : ''}
        </p>
        <div className={styles.statGrid}>
          <Stat value={status?.chaptersExtracted} total={status?.chaptersTotal} label={isSource ? 'chapters extracted' : 'chapters planned'} />
          <Stat value={status?.draftsFinal} total={status?.draftsTotal} label="drafts final" />
          <div>
            <div className={styles.planValue} data-approved={status?.planApproved ?? false}>
              {status?.planApproved ? 'Yes' : 'No'}
            </div>
            <div className={styles.statLabel}>plan approved</div>
          </div>
        </div>
        <div className={styles.cardFooter}>
          {draftsDone ? (
            <StatusChip intent="success">On track</StatusChip>
          ) : status?.planApproved ? (
            <StatusChip intent="info">Drafting</StatusChip>
          ) : (
            <StatusChip intent="neutral">Planning</StatusChip>
          )}
          <span className={styles.cardTime}>{relativeTime(project.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function Dashboard(): React.JSX.Element {
  const navigate = useNavigate();
  const projectsQuery = useListProjectsQuery({ limit: 50 });
  const projects = projectsQuery.data?.items ?? [];
  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<ProjectKind>('new_novel');

  const sourceCount = projects.filter(p => p.kind === 'source').length;
  const newCount = projects.filter(p => p.kind === 'new_novel').length;
  const visible = filter === 'all' ? projects : projects.filter(p => p.kind === filter);

  const openCreate = (kind: ProjectKind): void => {
    setCreateKind(kind);
    setCreateOpen(true);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'} · ${sourceCount} source · ${newCount} original`}
        extra={
          <>
            <Button variant="secondary" onClick={() => openCreate('source')}>
              Import source
            </Button>
            <Button variant="primary" prefix={<PlusIcon />} onClick={() => openCreate('new_novel')}>
              New project
            </Button>
          </>
        }
      />

      <div className={styles.toolbar}>
        <SegmentedControl value={filter} onValueChange={v => setFilter(v as Filter)}>
          <SegmentedControl.Item value="all">All {projects.length}</SegmentedControl.Item>
          <SegmentedControl.Item value="source">Source {sourceCount}</SegmentedControl.Item>
          <SegmentedControl.Item value="new_novel">Original {newCount}</SegmentedControl.Item>
        </SegmentedControl>
        <div className={styles.spacer} />
        <span className={styles.toolbarNote}>Sorted by last activity</span>
      </div>

      <QueryState
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        isEmpty={visible.length === 0}
        emptyTitle="No projects yet"
        emptyDescription="Create your first novel or import a source to get started."
        emptyAction={{ label: 'New project', onClick: () => openCreate('new_novel') }}
      >
        <div className={styles.grid}>
          {visible.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
          <button onClick={() => openCreate('new_novel')} className={styles.newCard}>
            <span className={styles.newIcon}>
              <PlusIcon size={20} />
            </span>
            <span className={styles.newLabel}>New project</span>
            <span className={styles.newHint}>Start from premise or import source</span>
          </button>
        </div>
      </QueryState>

      <NewNovelModal
        key={createKind}
        open={createOpen}
        initialKind={createKind}
        onOpenChange={setCreateOpen}
        onCreated={project => navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } })}
      />
    </div>
  );
}
