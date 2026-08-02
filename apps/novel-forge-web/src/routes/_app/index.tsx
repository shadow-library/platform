/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, SegmentedControl } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { BookIcon, PlusIcon, UploadIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/nf';
import { NewNovelModal } from '@/features/projects/NewNovelModal';
import { listProjectsQueryOptions, type ProjectResponse, useListProjectsQuery, useProjectStatusQuery } from '@/lib/apis';
import { projectKindLabel, projectKindTag, projectTitle, relativeTime } from '@/lib/format';

import styles from './index.module.css';

// The project list is the landing screen's primary data, so the loader prefetches it — the grid is
// server-rendered on first paint. Per-card status stays a client query (secondary, one request per card).
export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: 'Projects · Novel Forge' }] }),
  loader: ({ context }) => context.queryClient.prefetchQuery(listProjectsQueryOptions({ limit: 50 })),
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
      {project.coverUrl ? (
        <img src={project.coverUrl} alt="" className={styles.cardCover} />
      ) : (
        <div className={styles.coverPlaceholder} data-kind={project.kind} aria-hidden="true">
          <BookIcon size={40} />
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.chipRow}>
          <StatusChip intent={isSource ? 'info' : 'accent'}>{projectKindTag(project.kind)}</StatusChip>
          <span className={styles.cardId}>#{project.id}</span>
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

  const sourceCount = projects.filter(p => p.kind === 'source').length;
  const newCount = projects.filter(p => p.kind === 'new_novel').length;
  const visible = filter === 'all' ? projects : projects.filter(p => p.kind === filter);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length === 1 ? '' : 's'} · ${sourceCount} source · ${newCount} original`}
        extra={
          <>
            <Button variant="secondary" prefix={<UploadIcon />} onClick={() => navigate({ to: '/import' })}>
              Import novel
            </Button>
            <Button variant="primary" prefix={<PlusIcon />} onClick={() => setCreateOpen(true)}>
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
        emptyDescription="Create your first novel from a premise, or import one from a novel-import bundle."
        emptyAction={{ label: 'New project', onClick: () => setCreateOpen(true) }}
      >
        <div className={styles.grid}>
          {visible.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
          <button onClick={() => setCreateOpen(true)} className={styles.newCard}>
            <span className={styles.newIcon}>
              <PlusIcon size={20} />
            </span>
            <span className={styles.newLabel}>New project</span>
            <span className={styles.newHint}>Start from a premise</span>
          </button>
        </div>
      </QueryState>

      <NewNovelModal open={createOpen} onOpenChange={setCreateOpen} onCreated={project => navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } })} />
    </div>
  );
}
