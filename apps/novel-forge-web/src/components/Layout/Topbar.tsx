/**
 * Importing npm packages
 */
import { Avatar, CommandPalette, type CommandItem, Kbd, Popover, Spinner } from '@shadow-library/ui';
import { Link, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';

/**
 * Importing user defined modules
 */
import { useListJobsQuery, useListProjectsQuery, useProjectQuery } from '@/lib/apis';
import { projectTitle } from '@/lib/format';
import { type NovelParams, type ProjectRoute } from './routes';
import {
  BellIcon,
  BookIcon,
  ChatIcon,
  ChevronRightIcon,
  EditIcon,
  GridIcon,
  ListIcon,
  MenuIcon,
  OverviewIcon,
  ProposalsIcon,
  ReviewIcon,
  RunsIcon,
  SearchIcon,
  SettingsIcon,
  SourceIcon,
} from '../icons';

/**
 * Declaring types
 */
interface ScreenDef {
  segment: string;
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
}

/**
 * Declaring constants
 */
const PROJECT_SCREENS: ScreenDef[] = [
  { segment: 'overview', to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon /> },
  { segment: 'source', to: '/novels/$novelId/source', label: 'Source Pipeline', icon: <SourceIcon /> },
  { segment: 'story-bible', to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon /> },
  { segment: 'volumes', to: '/novels/$novelId/volumes', label: 'Volumes & Arcs', icon: <ListIcon /> },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon /> },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon /> },
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon /> },
  { segment: 'proposals', to: '/novels/$novelId/proposals', label: 'Proposals', icon: <ProposalsIcon /> },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon /> },
  { segment: 'settings', to: '/novels/$novelId/settings', label: 'Project Settings', icon: <SettingsIcon /> },
];

const SCREEN_LABEL = new Map(PROJECT_SCREENS.map(s => [s.segment, s.label]));

function JobsTray({ novelId }: NovelParams): React.JSX.Element {
  const jobsQuery = useListJobsQuery(novelId ?? '', Boolean(novelId));
  const jobs = jobsQuery.data?.items ?? [];
  const isActiveJob = (status: string): boolean => status === 'pending' || status === 'in_progress';
  const running = jobs.filter(j => isActiveJob(j.status));

  return (
    <Popover>
      <Popover.Trigger asChild>
        <button className="nf-ib" aria-label="Background jobs" style={{ width: 34, height: 34, position: 'relative' }}>
          <BellIcon size={17} />
          {running.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--sh-info-solid)',
                boxShadow: '0 0 0 2px var(--sh-surface-card)',
              }}
            />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={8} style={{ width: 300, padding: 0 }}>
        <Popover.Header title="Background jobs" description={running.length > 0 ? `${running.length} active` : 'Nothing running'} />
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
          {jobs.length === 0 && <div style={{ padding: '14px 10px', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>No recent jobs.</div>}
          {jobs.slice(0, 12).map(job => (
            <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 'var(--sh-radius-md)' }}>
              {isActiveJob(job.status) ? (
                <Spinner size="sm" />
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: job.status === 'failed' ? 'var(--sh-danger-solid)' : 'var(--sh-success-solid)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'capitalize' }}>{job.kind} · {job.target}</div>
                <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{job.status}</div>
              </div>
            </div>
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );
}

/**
 * The application top bar: breadcrumb, the ⌘K command palette, the background-job
 * tray, and the user avatar.
 */
interface TopbarProps {
  onMenuClick?: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps): React.JSX.Element {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { novelId } = useParams({ strict: false }) as NovelParams;
  const inProject = Boolean(novelId);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const projectQuery = useProjectQuery(novelId ?? '', inProject);
  const projectsQuery = useListProjectsQuery({ limit: 50 });
  const projects = projectsQuery.data?.items ?? [];

  const crumbRoot = inProject && projectQuery.data ? projectTitle(projectQuery.data) : 'Projects';
  const leafSegment = pathname.split('/').filter(Boolean).pop();
  const crumbLeaf = inProject && leafSegment ? (SCREEN_LABEL.get(leafSegment) ?? null) : null;

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];
    if (novelId) {
      for (const s of PROJECT_SCREENS) {
        items.push({
          id: `screen-${s.segment}`,
          group: 'This project',
          label: s.label,
          icon: s.icon,
          onRun: () => navigate({ to: s.to, params: { novelId } }),
        });
      }
    }
    items.push({ id: 'go-projects', group: 'Go to', label: 'All projects', icon: <GridIcon />, onRun: () => navigate({ to: '/' }) });
    for (const p of projects) {
      items.push({
        id: `project-${p.id}`,
        group: 'Open project',
        label: projectTitle(p),
        icon: <BookIcon />,
        keywords: [p.name],
        onRun: () => navigate({ to: '/novels/$novelId/overview', params: { novelId: p.id } }),
      });
    }
    return items;
  }, [navigate, novelId, projects]);

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 20px',
        borderBottom: '1px solid var(--sh-border-subtle)',
        background: 'var(--sh-surface-card)',
      }}
    >
      <button className="nf-ib nf-hamburger" aria-label="Open navigation" onClick={onMenuClick} style={{ width: 34, height: 34, marginLeft: -6 }}>
        <MenuIcon size={19} />
      </button>

      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: 'var(--sh-text-primary)', whiteSpace: 'nowrap' }}>{crumbRoot}</span>
        {crumbLeaf && (
          <>
            <ChevronRightIcon size={14} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumbLeaf}</span>
          </>
        )}
      </nav>

      <div style={{ flex: 1 }} />

      <button
        className="nf-search"
        onClick={() => setPaletteOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 34,
          padding: '0 10px 0 12px',
          borderRadius: 'var(--sh-radius-md)',
          border: '1px solid var(--sh-border-default)',
          background: 'var(--sh-surface-app)',
          color: 'var(--sh-text-tertiary)',
          fontSize: 'var(--sh-text-body-sm)',
          cursor: 'pointer',
          minWidth: 220,
        }}
      >
        <SearchIcon size={15} />
        <span style={{ flex: 1, textAlign: 'left' }}>Search or run a command…</span>
        <Kbd keys="mod+k" />
      </button>
      <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} hotkey="mod+k" placeholder="Search screens, projects, commands…" />

      {inProject && <JobsTray novelId={novelId} />}

      <div style={{ width: 1, height: 22, background: 'var(--sh-border-subtle)' }} />
      <Link to="/" aria-label="Account">
        <Avatar name="Rowan Keller" size="sm" />
      </Link>
    </header>
  );
}
