/**
 * Importing npm packages
 */
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Avatar, type CommandItem, CommandPalette, DropdownMenu, Kbd, Popover, Spinner, toast, useShellNav } from '@shadow-library/ui';
import { userDisplayName } from '@shadow-library/web';

/**
 * Importing user defined modules
 */
import { useListJobsQuery, useListProjectsQuery, useLogoutMutation, useMeQuery, useProjectQuery } from '@/lib/apis';
import { projectTitle } from '@/lib/format';
import {
  BellIcon,
  BookIcon,
  ChatIcon,
  ChevronRightIcon,
  EditIcon,
  GridIcon,
  ListIcon,
  LogoutIcon,
  MenuIcon,
  OverviewIcon,
  ProposalsIcon,
  ReviewIcon,
  RunsIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SourceIcon,
  UploadIcon,
} from '../icons';
import { type NovelParams, type ProjectRoute } from './routes';
import styles from './Topbar.module.css';

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
  { segment: 'import-plan', to: '/novels/$novelId/import-plan', label: 'Import Plan', icon: <UploadIcon /> },
  { segment: 'chapters', to: '/novels/$novelId/chapters', label: 'Chapters', icon: <EditIcon /> },
  { segment: 'review', to: '/novels/$novelId/review', label: 'Review Queue', icon: <ReviewIcon /> },
  { segment: 'chat', to: '/novels/$novelId/chat', label: 'Refinement Chat', icon: <ChatIcon /> },
  { segment: 'proposals', to: '/novels/$novelId/proposals', label: 'Proposals', icon: <ProposalsIcon /> },
  { segment: 'runs', to: '/novels/$novelId/runs', label: 'Workflow Runs', icon: <RunsIcon /> },
  { segment: 'publish', to: '/novels/$novelId/publish', label: 'Publish', icon: <SendIcon /> },
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
        <button className={`nf-ib ${styles.bellBtn}`} aria-label="Background jobs">
          <BellIcon size={17} />
          {running.length > 0 && <span className={styles.bellBadge} />}
        </button>
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={8} className={styles.jobsPopover}>
        <Popover.Header title="Background jobs" description={running.length > 0 ? `${running.length} active` : 'Nothing running'} />
        <div className={styles.jobsList}>
          {jobs.length === 0 && <div className={styles.jobsEmpty}>No recent jobs.</div>}
          {jobs.slice(0, 12).map(job => (
            <div key={job.id} className={styles.jobRow}>
              {isActiveJob(job.status) ? <Spinner size="sm" /> : <span className={styles.jobDot} data-failed={job.status === 'failed' || undefined} />}
              <div className={styles.jobBody}>
                <div className={styles.jobTitle}>
                  {job.kind} · {job.target}
                </div>
                <div className={styles.jobStatus}>{job.status}</div>
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
export default function Topbar(): React.JSX.Element {
  const nav = useShellNav();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { novelId } = useParams({ strict: false }) as NovelParams;
  const inProject = Boolean(novelId);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const meQuery = useMeQuery();
  const logout = useLogoutMutation();
  const projectQuery = useProjectQuery(novelId ?? '', inProject);
  const projectsQuery = useListProjectsQuery({ limit: 50 });
  // Memoized so identity is stable across renders where the query data hasn't changed — otherwise the
  // `?? []` fallback mints a new array every render and defeats the `commands` useMemo below it.
  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data]);

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
        label: `${projectTitle(p)} · #${p.id}`,
        icon: <BookIcon />,
        keywords: [p.name, p.id],
        onRun: () => navigate({ to: '/novels/$novelId/overview', params: { novelId: p.id } }),
      });
    }
    return items;
  }, [navigate, novelId, projects]);

  // Ends the app session, then hands the browser back to the login shim. The SDK ends only this app's
  // session (identity's own persists), so the shim may re-establish it — that is the SDK's logout semantics.
  // Unless the deployment configures RP-initiated logout: then the reply carries identity's end-session URL,
  // which ends the central session too and bounces back on its own, so the browser is handed there instead
  // of to the shim — which would otherwise sign the author straight back in.
  const signOut = (): void => {
    logout.mutate(undefined, {
      onSuccess: result => {
        if (result.redirectTo) return window.location.assign(result.redirectTo);
        void navigate({ to: '/login', search: { returnTo: '/' } });
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <header className={styles.topbar}>
      {nav.hasSidebar && (
        <button
          type="button"
          className={`nf-ib ${styles.hamburger}`}
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={nav.open}
          onClick={() => nav.setOpen(true)}
        >
          <MenuIcon size={19} />
        </button>
      )}

      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <span className={styles.crumbRoot}>{crumbRoot}</span>
        {crumbLeaf && (
          <>
            <ChevronRightIcon size={14} />
            <span className={styles.crumbLeaf}>{crumbLeaf}</span>
          </>
        )}
      </nav>

      <div className={styles.spacer} />

      <button className={`nf-search ${styles.search}`} onClick={() => setPaletteOpen(true)}>
        <SearchIcon size={15} />
        <span className={styles.searchLabel}>Search or run a command…</span>
        <Kbd keys="mod+k" />
      </button>
      <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} hotkey="mod+k" placeholder="Search screens, projects, commands…" />

      {inProject && <JobsTray novelId={novelId} />}

      <div className={styles.divider} />
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <button className={styles.avatarBtn} aria-label="Account menu">
            <Avatar name={userDisplayName(meQuery.data)} size="sm" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={8}>
          <DropdownMenu.Label>{userDisplayName(meQuery.data)}</DropdownMenu.Label>
          <DropdownMenu.Separator />
          <DropdownMenu.Item icon={<GridIcon />} onSelect={() => void navigate({ to: '/' })}>
            All projects
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item icon={<LogoutIcon />} destructive disabled={logout.isPending} onSelect={signOut}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </header>
  );
}
