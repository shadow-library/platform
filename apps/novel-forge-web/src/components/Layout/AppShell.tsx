/**
 * Importing npm packages
 */
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { type PropsWithChildren, useMemo, useState } from 'react';
import { type CommandItem, CommandPalette, IconButton, Kbd, toast, Tooltip, useTheme } from '@shadow-library/ui';
import { AppShell as Chrome, type NavConfig, type NavLeaf } from '@shadow-library/ui/router';
import { userDisplayName } from '@shadow-library/web';

/**
 * Importing user defined modules
 */
import { useListProjectsQuery, useListProposalsQuery, useLogoutMutation, useMeQuery, useProjectQuery, useProjectStatusQuery, useReviewQueueQuery } from '@/lib/apis';
import { imageUrl, lifecyclePhase, projectDotColor, projectKindTag, projectTitle } from '@/lib/format';

import { BookIcon, GridIcon, MoonIcon, SearchIcon, SunIcon } from '../icons';
import styles from './AppShell.module.css';
import { JobsTray } from './JobsTray';
import { type NovelParams } from './routes';
import { PROJECT_SCREENS, type ProjectScreen, SCREEN_LABEL, screensForKind } from './screens';

/**
 * Declaring the constants
 */
const PROJECT_LIMIT = 50;

/**
 * The light/dark switch, in the top bar's utility cluster alongside every other Shadow app. It used to
 * sit in the sidebar footer, which put it behind a hamburger on a phone.
 */
function ThemeToggle(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Tooltip content={dark ? 'Light theme' : 'Dark theme'}>
      <IconButton variant="ghost" size="sm" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} icon={dark ? <SunIcon /> : <MoonIcon />} onClick={toggleTheme} />
    </Tooltip>
  );
}

/**
 * The application chrome. `AppShell` from the design system owns the rail, the top bar, the account menu,
 * and the sub-md nav drawer; Novel Forge supplies its destinations, the project switcher's data, and the
 * lifecycle bar.
 *
 * One nav with two modes — global (every project) and project (a single novel's workspace) — chosen by
 * whether the route carries a `novelId`.
 *
 * The content region is handed over whole (`fluid` + no gutters) because screens here disagree about what
 * it is: document screens opt into the 1120px `nf-page` column, while the editor, chat, and bible fill it
 * edge to edge off `.content`'s positioning context (see `.nf-splitpane` in styles.css).
 */
export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { novelId } = useParams({ strict: false }) as NovelParams;
  const inProject = Boolean(novelId);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const meQuery = useMeQuery();
  const logout = useLogoutMutation();
  const projectsQuery = useListProjectsQuery({ limit: PROJECT_LIMIT });
  // Memoized so identity is stable across renders where the query data hasn't changed — otherwise the
  // `?? []` fallback mints a new array every render and defeats the `commands` useMemo below it.
  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data]);
  const projectQuery = useProjectQuery(novelId ?? '', inProject);
  const statusQuery = useProjectStatusQuery(novelId ?? '', inProject);
  const reviewQuery = useReviewQueueQuery(novelId ?? '', inProject);
  const proposalsQuery = useListProposalsQuery(novelId ?? '', { status: 'pending', limit: PROJECT_LIMIT }, inProject);

  const project = projectQuery.data;
  const status = statusQuery.data;
  const phase = lifecyclePhase(status);

  /** Live counts keyed by screen, so the nav declaration stays static and the numbers stay current. */
  const badges: Record<string, NavLeaf['badge']> = {
    chapters: { count: status?.chaptersTotal ?? 0 },
    review: { count: reviewQuery.data?.drafts.length ?? 0, intent: 'warning' },
    proposals: { count: proposalsQuery.data?.items.length ?? 0, intent: 'warning' },
  };

  const options = projects.map(candidate => ({
    id: candidate.id,
    label: projectTitle(candidate),
    caption: `${projectKindTag(candidate.kind)} · #${candidate.id}`,
    imageUrl: imageUrl(candidate.coverImagePath),
    color: projectDotColor(candidate),
  }));

  const toLeaf = (screen: ProjectScreen): NavLeaf => ({
    to: screen.to,
    params: { novelId: novelId ?? '' },
    label: screen.label,
    icon: screen.icon,
    badge: badges[screen.segment],
  });

  const screens = screensForKind(project?.kind);
  const nav: NavConfig = inProject
    ? {
        variant: 'project',
        project: {
          current: options.find(option => option.id === novelId),
          options,
          emptyLabel: 'All projects',
          loading: projectsQuery.isLoading,
          onSelect: id => void navigate({ to: '/novels/$novelId/overview', params: { novelId: id } }),
          footerAction: { label: 'View all projects', icon: <GridIcon />, onSelect: () => void navigate({ to: '/' }) },
        },
        sections: [{ items: screens.filter(screen => !screen.trailing).map(toLeaf) }, { items: screens.filter(screen => screen.trailing).map(toLeaf) }],
      }
    : {
        variant: 'sections',
        sections: [
          { items: [{ to: '/', label: 'Projects', icon: <GridIcon />, exact: true }] },
          {
            label: 'Pinned',
            hidden: projects.length === 0,
            items: projects.slice(0, 3).map(pinned => ({ to: '/novels/$novelId/overview', params: { novelId: pinned.id }, label: projectTitle(pinned), icon: <BookIcon /> })),
          },
        ],
      };

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];
    if (novelId) {
      for (const screen of PROJECT_SCREENS) {
        items.push({
          id: `screen-${screen.segment}`,
          group: 'This project',
          label: screen.label,
          icon: screen.icon,
          onRun: () => navigate({ to: screen.to, params: { novelId } }),
        });
      }
    }
    items.push({ id: 'go-projects', group: 'Go to', label: 'All projects', icon: <GridIcon />, onRun: () => navigate({ to: '/' }) });
    for (const candidate of projects) {
      items.push({
        id: `project-${candidate.id}`,
        group: 'Open project',
        label: `${projectTitle(candidate)} · #${candidate.id}`,
        icon: <BookIcon />,
        keywords: [candidate.name, candidate.id],
        onRun: () => navigate({ to: '/novels/$novelId/overview', params: { novelId: candidate.id } }),
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

  const leafSegment = pathname.split('/').filter(Boolean).pop();
  const crumbLeaf = inProject && leafSegment != null ? SCREEN_LABEL.get(leafSegment) : undefined;
  const crumbRoot = inProject && project ? projectTitle(project) : 'Projects';

  return (
    <Chrome
      brand={{ icon: <BookIcon size={17} />, name: 'Novel Forge', to: '/' }}
      nav={nav}
      account={{
        name: userDisplayName(meQuery.data),
        items: [{ id: 'projects', label: 'All projects', icon: <GridIcon />, onSelect: () => void navigate({ to: '/' }) }],
        onSignOut: signOut,
      }}
      breadcrumb={crumbLeaf != null ? `${crumbRoot} / ${crumbLeaf}` : crumbRoot}
      search={
        <>
          <button className={`nf-search ${styles.search}`} onClick={() => setPaletteOpen(true)}>
            <SearchIcon size={15} />
            <span className={styles.searchLabel}>Search or run a command…</span>
            <Kbd keys="mod+k" />
          </button>
          <CommandPalette commands={commands} open={paletteOpen} onOpenChange={setPaletteOpen} hotkey="mod+k" placeholder="Search screens, projects, commands…" />
        </>
      }
      actions={inProject ? <JobsTray novelId={novelId} /> : undefined}
      utility={<ThemeToggle />}
      sidebarFooter={
        inProject ? (
          <div className={styles.lifecycle}>
            <div className={styles.lifecycleHeading}>Lifecycle</div>
            <div className={styles.lifecycleBar}>
              {Array.from({ length: phase.total }).map((_, index) => (
                <div key={index} className={styles.lifecycleSeg} data-state={index < phase.completed ? 'done' : index === phase.completed ? 'current' : 'todo'} />
              ))}
            </div>
            <div className={styles.lifecycleLabel}>
              {phase.label} · {phase.completed} of {phase.total} phases
            </div>
          </div>
        ) : undefined
      }
      contentWidth="fluid"
      contentPadding="none"
      className={styles.shellRoot}
    >
      <div className={`nf-scroll ${styles.content}`}>{children}</div>
    </Chrome>
  );
}
