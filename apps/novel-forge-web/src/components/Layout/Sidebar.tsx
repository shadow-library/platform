/**
 * Importing npm packages
 */
import { Avatar, Badge, IconButton, Popover, Tooltip } from '@shadow-library/ui';
import { Link, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

/**
 * Importing user defined modules
 */
import { useListProjectsQuery, useListProposalsQuery, useProjectQuery, useProjectStatusQuery, useReviewQueueQuery } from '@/lib/apis';
import { lifecyclePhase, projectDotColor, projectKindTag, projectTitle } from '@/lib/format';
import { useTheme } from '../AppProvider';
import { type NovelParams, type ProjectRoute } from './routes';
import {
  BookIcon,
  ChatIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  EditIcon,
  GlobeIcon,
  GridIcon,
  ListIcon,
  MoonIcon,
  OverviewIcon,
  ProposalsIcon,
  ReviewIcon,
  RunsIcon,
  SettingsIcon,
  SourceIcon,
  SunIcon,
} from '../icons';

/**
 * Declaring types
 */
interface ProjectNavItem {
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
  badge?: number;
  sourceOnly?: boolean;
  warnBadge?: boolean;
}

/**
 * Declaring constants
 */
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--sh-text-tertiary)',
};

function Brand(): React.JSX.Element {
  return (
    <Link to="/" aria-label="Novel Forge — all projects" style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'inherit', textDecoration: 'none' }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          background: 'linear-gradient(140deg,var(--sh-indigo-500),var(--sh-indigo-700))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--sh-shadow-e1)',
          color: '#fff',
        }}
      >
        <BookIcon size={15} />
      </div>
      <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700, letterSpacing: '-0.01em' }}>Novel Forge</span>
    </Link>
  );
}

/**
 * The one application sidebar. It adapts between global mode (all projects) and
 * project mode (a single novel's workspace), matching the design's `inProject`
 * toggle, and owns the project switcher, lifecycle bar, and user footer.
 */
interface SidebarProps {
  open?: boolean;
}

export default function Sidebar({ open = false }: SidebarProps): React.JSX.Element {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { novelId } = useParams({ strict: false }) as NovelParams;
  const inProject = Boolean(novelId);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const projectsQuery = useListProjectsQuery({ limit: 50 });
  const projects = projectsQuery.data?.items ?? [];
  const projectQuery = useProjectQuery(novelId ?? '', inProject);
  const statusQuery = useProjectStatusQuery(novelId ?? '', inProject);
  const reviewQuery = useReviewQueueQuery(novelId ?? '', inProject);
  const proposalsQuery = useListProposalsQuery(novelId ?? '', { status: 'pending', limit: 50 }, inProject);

  const project = projectQuery.data;
  const status = statusQuery.data;
  const phase = lifecyclePhase(status);
  const reviewCount = reviewQuery.data?.drafts.length ?? 0;
  const proposalCount = proposalsQuery.data?.items.length ?? 0;

  const isActive = (to: ProjectRoute): boolean => {
    const target = to.replace('$novelId', novelId ?? '');
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const projectNav: ProjectNavItem[] = [
    { to: '/novels/$novelId/overview', label: 'Overview', icon: <OverviewIcon /> },
    { to: '/novels/$novelId/source', label: 'Source Pipeline', icon: <SourceIcon />, sourceOnly: true },
    { to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon /> },
    { to: '/novels/$novelId/volumes', label: 'Volumes & Arcs', icon: <ListIcon /> },
    { to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon />, badge: status?.chaptersTotal },
    { to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon />, badge: reviewCount, warnBadge: true },
    { to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon /> },
    { to: '/novels/$novelId/proposals', label: 'Proposals', icon: <ProposalsIcon />, badge: proposalCount, warnBadge: true },
    { to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon /> },
  ];

  return (
    <aside
      className="nf-sidebar"
      data-open={open}
      style={{
        background: 'var(--sh-surface-card)',
        borderRight: '1px solid var(--sh-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Brand />

      {/* project switcher */}
      <div style={{ position: 'relative', padding: '0 12px 12px', borderBottom: '1px solid var(--sh-border-subtle)' }}>
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                borderRadius: 'var(--sh-radius-md)',
                border: '1px solid var(--sh-border-default)',
                background: 'var(--sh-surface-app)',
                cursor: 'pointer',
                color: 'var(--sh-text-primary)',
              }}
            >
              {inProject && project ? (
                <>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: projectDotColor(project), flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left', lineHeight: 1.2 }}>
                    <span style={{ display: 'block', fontSize: 'var(--sh-text-body-sm)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {projectTitle(project)}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{projectKindTag(project.kind)}</span>
                  </span>
                </>
              ) : (
                <>
                  <GlobeIcon size={17} style={{ color: 'var(--sh-text-secondary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, color: 'var(--sh-text-secondary)' }}>All projects</span>
                </>
              )}
              <ChevronsUpDownIcon size={15} style={{ color: 'var(--sh-text-tertiary)', flexShrink: 0 }} />
            </button>
          </Popover.Trigger>
          <Popover.Content align="start" sideOffset={6} style={{ width: 226, padding: 6 }}>
            <div style={{ ...SECTION_LABEL, padding: '6px 10px 4px' }}>Switch project</div>
            {projects.map(p => (
              <button
                key={p.id}
                className="nf-selrow"
                onClick={() => {
                  setSwitcherOpen(false);
                  navigate({ to: '/novels/$novelId/overview', params: { novelId: p.id } });
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 2, background: projectDotColor(p), flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projectTitle(p)}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{projectKindTag(p.kind)}</span>
                </span>
                {p.id === novelId && <CheckIcon size={14} style={{ color: 'var(--sh-accent)' }} />}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--sh-border-subtle)', margin: '5px 4px' }} />
            <button
              className="nf-selrow"
              style={{ color: 'var(--sh-text-secondary)' }}
              onClick={() => {
                setSwitcherOpen(false);
                navigate({ to: '/' });
              }}
            >
              <GridIcon size={16} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 500 }}>View all projects</span>
            </button>
          </Popover.Content>
        </Popover>
      </div>

      {/* nav */}
      {inProject ? (
        <nav className="nf-scroll nf-swap" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }} aria-label="Project navigation">
          {projectNav
            .filter(item => !item.sourceOnly || project?.kind === 'source')
            .map(item => {
              const active = isActive(item.to);
              return (
                <Link key={item.to} to={item.to} params={{ novelId: novelId ?? '' }} className="nf-nav" data-active={active} aria-current={active ? 'page' : undefined}>
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <Badge intent={item.warnBadge ? 'warning' : 'neutral'} variant="count">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          <div style={{ height: 1, background: 'var(--sh-border-subtle)', margin: '12px 4px' }} />
          <Link
            to="/novels/$novelId/settings"
            params={{ novelId: novelId ?? '' }}
            className="nf-nav"
            data-active={isActive('/novels/$novelId/settings')}
            aria-current={isActive('/novels/$novelId/settings') ? 'page' : undefined}
          >
            <SettingsIcon />
            <span style={{ flex: 1 }}>Project Settings</span>
          </Link>

          <div style={{ flex: 1 }} />
          <div style={{ padding: '10px 8px 4px' }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>Lifecycle</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              {Array.from({ length: phase.total }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 99,
                    background: i < phase.completed ? 'var(--sh-success-solid)' : i === phase.completed ? 'var(--sh-accent)' : 'var(--sh-bg-pressed)',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>
              {phase.label} · {phase.completed} of {phase.total} phases
            </div>
          </div>
        </nav>
      ) : (
        <nav className="nf-scroll nf-swap" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }} aria-label="Global navigation">
          <Link to="/" className="nf-nav" data-active={pathname === '/'} aria-current={pathname === '/' ? 'page' : undefined}>
            <GridIcon />
            <span style={{ flex: 1 }}>Projects</span>
          </Link>

          {projects.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--sh-border-subtle)', margin: '12px 4px' }} />
              <div style={{ ...SECTION_LABEL, padding: '4px 10px 6px' }}>Pinned</div>
              {projects.slice(0, 3).map(p => (
                <Link key={p.id} to="/novels/$novelId/overview" params={{ novelId: p.id }} className="nf-nav">
                  <span style={{ width: 16, display: 'flex', justifyContent: 'center' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: projectDotColor(p) }} />
                  </span>
                  {projectTitle(p)}
                </Link>
              ))}
            </>
          )}
        </nav>
      )}

      {/* user footer */}
      <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--sh-border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name="Rowan Keller" size="sm" />
        <div style={{ flex: 1, lineHeight: 1.15, overflow: 'hidden' }}>
          <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Rowan Keller</div>
          <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>Author workspace</div>
        </div>
        <Tooltip content={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
          <IconButton variant="ghost" size="sm" aria-label="Toggle theme" icon={theme === 'dark' ? <SunIcon /> : <MoonIcon />} onClick={toggleTheme} />
        </Tooltip>
      </div>
    </aside>
  );
}
