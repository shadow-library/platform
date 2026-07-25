/**
 * Importing npm packages
 */
import { Link, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { Avatar, Badge, IconButton, Popover, Tooltip, useTheme } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { useListProjectsQuery, useListProposalsQuery, useProjectQuery, useProjectStatusQuery, useReviewQueueQuery, useSessionQuery } from '@/lib/apis';
import { imageUrl, lifecyclePhase, projectDotColor, projectKindTag, projectTitle, userDisplayName } from '@/lib/format';
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
  SendIcon,
  SettingsIcon,
  SourceIcon,
  SparkIcon,
  SunIcon,
  UploadIcon,
} from '../icons';
import { type NovelParams, type ProjectRoute } from './routes';
import styles from './Sidebar.module.css';

/**
 * Declaring types
 */
interface ProjectNavItem {
  to: ProjectRoute;
  label: string;
  icon: ReactNode;
  badge?: number;
  sourceOnly?: boolean;
  newNovelOnly?: boolean;
  warnBadge?: boolean;
}

/**
 * Declaring constants
 */
/** A small square status dot whose colour follows the passed project. */
function projectDotVar(color: string): React.CSSProperties {
  return { '--nf-dot': color } as React.CSSProperties;
}

function Brand(): React.JSX.Element {
  return (
    <Link to="/" aria-label="Novel Forge — all projects" className={styles.brand}>
      <div className={styles.brandMark}>
        <BookIcon size={15} />
      </div>
      <span className={styles.brandName}>Novel Forge</span>
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

  const sessionQuery = useSessionQuery();
  const projectsQuery = useListProjectsQuery({ limit: 50 });
  const projects = projectsQuery.data?.items ?? [];
  const projectQuery = useProjectQuery(novelId ?? '', inProject);
  const statusQuery = useProjectStatusQuery(novelId ?? '', inProject);
  const reviewQuery = useReviewQueueQuery(novelId ?? '', inProject);
  const proposalsQuery = useListProposalsQuery(novelId ?? '', { status: 'pending', limit: 50 }, inProject);

  const session = sessionQuery.data;
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
    { to: '/novels/$novelId/rebrand', label: 'Rebrand', icon: <GlobeIcon />, sourceOnly: true },
    { to: '/novels/$novelId/reforge', label: 'Reforge', icon: <SparkIcon />, sourceOnly: true },
    { to: '/novels/$novelId/story-bible', label: 'Story Bible', icon: <BookIcon /> },
    { to: '/novels/$novelId/volumes', label: 'Volumes & Arcs', icon: <ListIcon /> },
    { to: '/novels/$novelId/import-plan', label: 'Import Plan', icon: <UploadIcon />, newNovelOnly: true },
    { to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon />, badge: status?.chaptersTotal },
    { to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon />, badge: reviewCount, warnBadge: true },
    { to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon /> },
    { to: '/novels/$novelId/proposals', label: 'Proposals', icon: <ProposalsIcon />, badge: proposalCount, warnBadge: true },
    { to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon /> },
    { to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon /> },
  ];

  return (
    <aside className={`nf-sidebar ${styles.sidebar}`} data-open={open}>
      <Brand />

      {/* project switcher */}
      <div className={styles.switcher}>
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <Popover.Trigger asChild>
            <button type="button" className={styles.switcherTrigger}>
              {inProject && project ? (
                <>
                  {project.coverImagePath ? (
                    <img className={styles.switcherThumb} src={imageUrl(project.coverImagePath)} alt="" />
                  ) : (
                    <span className={styles.projectDot} style={projectDotVar(projectDotColor(project))} />
                  )}
                  <span className={styles.projectMeta}>
                    <span className={styles.projectName}>{projectTitle(project)}</span>
                    <span className={styles.projectKind}>
                      {projectKindTag(project.kind)} · #{project.id}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <GlobeIcon size={17} className={styles.iconSecondary} />
                  <span className={styles.allProjectsLabel}>All projects</span>
                </>
              )}
              <ChevronsUpDownIcon size={15} className={styles.iconTertiary} />
            </button>
          </Popover.Trigger>
          <Popover.Content align="start" sideOffset={6} className={styles.switcherMenu}>
            <div className={`${styles.sectionLabel} ${styles.sectionLabelSwitcher}`}>Switch project</div>
            {projects.map(p => (
              <button
                key={p.id}
                className="nf-selrow"
                onClick={() => {
                  setSwitcherOpen(false);
                  navigate({ to: '/novels/$novelId/overview', params: { novelId: p.id } });
                }}
              >
                {p.coverImagePath ? (
                  <img className={styles.switcherThumb} src={imageUrl(p.coverImagePath)} alt="" />
                ) : (
                  <span className={styles.projectDot} style={projectDotVar(projectDotColor(p))} />
                )}
                <span className={styles.rowMeta}>
                  <span className={styles.rowName}>{projectTitle(p)}</span>
                  <span className={styles.projectKind}>
                    {projectKindTag(p.kind)} · #{p.id}
                  </span>
                </span>
                {p.id === novelId && <CheckIcon size={14} className={styles.iconAccent} />}
              </button>
            ))}
            <div className={styles.menuDivider} />
            <button
              className={`nf-selrow ${styles.rowMuted}`}
              onClick={() => {
                setSwitcherOpen(false);
                navigate({ to: '/' });
              }}
            >
              <GridIcon size={16} className={styles.iconShrink} />
              <span className={styles.rowActionLabel}>View all projects</span>
            </button>
          </Popover.Content>
        </Popover>
      </div>

      {/* nav */}
      {inProject ? (
        <nav className={`nf-scroll nf-swap ${styles.nav}`} aria-label="Project navigation">
          {projectNav
            .filter(item => !item.sourceOnly || project?.kind === 'source')
            .filter(item => !item.newNovelOnly || project?.kind === 'new_novel')
            .map(item => {
              const active = isActive(item.to);
              return (
                <Link key={item.to} to={item.to} params={{ novelId: novelId ?? '' }} className="nf-nav" data-active={active} aria-current={active ? 'page' : undefined}>
                  {item.icon}
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <Badge intent={item.warnBadge ? 'warning' : 'neutral'} variant="count">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          <div className={styles.navDivider} />
          <Link
            to="/novels/$novelId/settings"
            params={{ novelId: novelId ?? '' }}
            className="nf-nav"
            data-active={isActive('/novels/$novelId/settings')}
            aria-current={isActive('/novels/$novelId/settings') ? 'page' : undefined}
          >
            <SettingsIcon />
            <span className={styles.navLabel}>Project Settings</span>
          </Link>

          <div className={styles.spacer} />
          <div className={styles.lifecycle}>
            <div className={`${styles.sectionLabel} ${styles.sectionLabelLifecycle}`}>Lifecycle</div>
            <div className={styles.lifecycleBar}>
              {Array.from({ length: phase.total }).map((_, i) => (
                <div key={i} className={styles.lifecycleSeg} data-state={i < phase.completed ? 'done' : i === phase.completed ? 'current' : 'todo'} />
              ))}
            </div>
            <div className={styles.lifecycleLabel}>
              {phase.label} · {phase.completed} of {phase.total} phases
            </div>
          </div>
        </nav>
      ) : (
        <nav className={`nf-scroll nf-swap ${styles.nav}`} aria-label="Global navigation">
          <Link to="/" className="nf-nav" data-active={pathname === '/'} aria-current={pathname === '/' ? 'page' : undefined}>
            <GridIcon />
            <span className={styles.navLabel}>Projects</span>
          </Link>

          {projects.length > 0 && (
            <>
              <div className={styles.navDivider} />
              <div className={`${styles.sectionLabel} ${styles.sectionLabelPinned}`}>Pinned</div>
              {projects.slice(0, 3).map(p => (
                <Link key={p.id} to="/novels/$novelId/overview" params={{ novelId: p.id }} className="nf-nav">
                  <span className={styles.pinnedDotWrap}>
                    <span className={styles.pinnedDot} style={projectDotVar(projectDotColor(p))} />
                  </span>
                  {projectTitle(p)}
                </Link>
              ))}
            </>
          )}
        </nav>
      )}

      {/* user footer */}
      <div className={styles.footer}>
        <Avatar name={userDisplayName(session)} size="sm" />
        <div className={styles.footerInfo}>
          <div className={styles.footerName}>{userDisplayName(session)}</div>
          <div className={styles.footerRole}>Author workspace</div>
        </div>
        <Tooltip content={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
          <IconButton variant="ghost" size="sm" aria-label="Toggle theme" icon={theme === 'dark' ? <SunIcon /> : <MoonIcon />} onClick={toggleTheme} />
        </Tooltip>
      </div>
    </aside>
  );
}
