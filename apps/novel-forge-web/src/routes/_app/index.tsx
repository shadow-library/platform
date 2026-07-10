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
import { projectKindLabel, projectKindTag, projectTitle, relativeTime } from '@/lib/format';

export const Route = createFileRoute('/_app/')({
  component: Dashboard,
});

type Filter = 'all' | 'source' | 'new_novel';

const STRIPE: Record<ProjectKind, string> = {
  source: 'linear-gradient(90deg,var(--sh-indigo-500),var(--sh-indigo-700))',
  new_novel: 'linear-gradient(90deg,var(--sh-green-400),var(--sh-green-600))',
};

interface StatProps {
  value?: number;
  total?: number;
  label: string;
}

function Stat({ value, total, label }: StatProps): React.JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? 0}
        {total != null && <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)', fontWeight: 500 }}>/{total}</span>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{label}</div>
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
      className="nf-cardhover"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') open();
      }}
      style={{ background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', overflow: 'hidden', cursor: 'pointer' }}
    >
      <div style={{ height: 4, background: STRIPE[project.kind] }} />
      <div style={{ padding: '16px 16px 14px' }}>
        <div style={{ marginBottom: 6 }}>
          <StatusChip intent={isSource ? 'info' : 'accent'}>{projectKindTag(project.kind)}</StatusChip>
        </div>
        <h3 style={{ margin: '8px 0 0', fontSize: 'var(--sh-text-body-lg)', fontWeight: 700, letterSpacing: '-0.01em' }}>{projectTitle(project)}</h3>
        <p style={{ margin: '3px 0 0', fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>
          {projectKindLabel(project.kind)}
          {project.storyCurrentChapter ? ` · Chapter ${project.storyCurrentChapter}` : ''}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '14px 0 12px' }}>
          <Stat value={status?.chaptersExtracted} total={status?.chaptersTotal} label={isSource ? 'chapters extracted' : 'chapters planned'} />
          <Stat value={status?.draftsFinal} total={status?.draftsTotal} label="drafts final" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: status?.planApproved ? 'var(--sh-success-text-on-subtle)' : 'var(--sh-text-tertiary)' }}>{status?.planApproved ? 'Yes' : 'No'}</div>
            <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>plan approved</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--sh-border-subtle)' }}>
          {draftsDone ? (
            <StatusChip intent="success">On track</StatusChip>
          ) : status?.planApproved ? (
            <StatusChip intent="info">Drafting</StatusChip>
          ) : (
            <StatusChip intent="neutral">Planning</StatusChip>
          )}
          <span style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>{relativeTime(project.updatedAt)}</span>
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 28px 60px' }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <SegmentedControl value={filter} onValueChange={v => setFilter(v as Filter)}>
          <SegmentedControl.Item value="all">All {projects.length}</SegmentedControl.Item>
          <SegmentedControl.Item value="source">Source {sourceCount}</SegmentedControl.Item>
          <SegmentedControl.Item value="new_novel">Original {newCount}</SegmentedControl.Item>
        </SegmentedControl>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>Sorted by last activity</span>
      </div>

      <QueryState
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        isEmpty={visible.length === 0}
        emptyTitle="No projects yet"
        emptyDescription="Create your first novel or import a source to get started."
        emptyAction={{ label: 'New project', onClick: () => openCreate('new_novel') }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
          {visible.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
          <button
            onClick={() => openCreate('new_novel')}
            style={{
              background: 'transparent',
              border: '1.5px dashed var(--sh-border-default)',
              borderRadius: 'var(--sh-radius-lg)',
              minHeight: 210,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: 'pointer',
              color: 'var(--sh-text-tertiary)',
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--sh-surface-card)',
                border: '1px solid var(--sh-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlusIcon size={20} />
            </span>
            <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600 }}>New project</span>
            <span style={{ fontSize: 'var(--sh-text-caption)' }}>Start from premise or import source</span>
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
