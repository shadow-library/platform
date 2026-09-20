import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { type PropsWithChildren, useCallback, useMemo, useState } from 'react';
import { type CommandItem, CommandPalette, IconButton, Kbd, toast, Tooltip, useTheme } from '@shadow-library/ui';
import { AppShell as Chrome, type NavBranch, type NavConfig, type NavLeaf, type NavNode } from '@shadow-library/ui/router';
import { userDisplayName } from '@shadow-library/web';

import { IdeaRename } from '@/components/nf';
import {
  applySeedName,
  invalidateSeed,
  translationJobActive,
  useChatSessionQuery,
  useListChatSessionsQuery,
  useListProjectsQuery,
  useListProposalsQuery,
  useLogoutMutation,
  useMeQuery,
  useProjectQuery,
  useProjectStatusQuery,
  useReviewQueueQuery,
  useSeedQuery,
  useTranslationStatusQuery,
  useUpdateProjectMutation,
} from '@/lib/apis';
import { allChatsLabel, chatTitle, openChatId, RECENT_CHAT_LIMIT, recentChats } from '@/lib/chat-sessions';
import { type JumpScope, type PaletteState, resolvePaletteView } from '@/lib/command-scope';
import { lifecyclePhase, projectDotColor, projectKindTag, projectTitle, sharedOwnerTag, translationLifecycle } from '@/lib/format';
import { firstTitle } from '@/lib/idea-title';
import { useIsAdmin } from '@/lib/session';

import { BookIcon, EditIcon, GridIcon, MoonIcon, PlusIcon, SearchIcon, SettingsIcon, SparkIcon, SunIcon } from '../icons';
import styles from './AppShell.module.css';
import { CommandScopeProvider } from './CommandScope';
import { JobsTray } from './JobsTray';
import { type NovelParams } from './routes';
import { type ProjectScreen, SCREEN_LABEL, screensForWorkflow } from './screens';

const PROJECT_LIMIT = 50;

// The sidebar's conversation list is nested under Refinement Chat (D6). The disclosure is what gates its
// query, so every other project screen costs nothing until the reader opens the group there.
type ChatListDisclosure = { kind: 'route' } | { kind: 'pinned'; open: boolean };

const CHAT_LIST_PARAMS = { scopeType: 'project', status: 'active', limit: RECENT_CHAT_LIMIT } as const;

function ThemeToggle(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Tooltip content={dark ? 'Light theme' : 'Dark theme'}>
      <IconButton variant="ghost" size="sm" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} icon={dark ? <SunIcon /> : <MoonIcon />} onClick={toggleTheme} />
    </Tooltip>
  );
}

export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  const { pathname, search: locationSearch } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { novelId, seedId } = useParams({ strict: false }) as NovelParams;
  const inProject = Boolean(novelId);
  const inIdeas = pathname === '/ideas' || pathname.startsWith('/ideas/');
  const onIdeaStudio = inIdeas && Boolean(seedId);
  const [palette, setPalette] = useState<PaletteState>({ kind: 'closed' });
  const [renamingIdea, setRenamingIdea] = useState(false);
  const renameIdea = useUpdateProjectMutation(seedId ?? '');

  const openScope = useCallback((scope: JumpScope) => setPalette({ kind: 'scoped', scope }), []);
  const dropScope = useCallback(() => setPalette(current => (current.kind === 'scoped' ? { kind: 'closed' } : current)), []);

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
  const seedQuery = useSeedQuery(seedId ?? '', onIdeaStudio);
  const isTranslation = projectQuery.data?.kind === 'translation';
  const translationQuery = useTranslationStatusQuery(novelId ?? '', inProject && isTranslation);

  const onChatRoute = inProject && pathname.endsWith('/chat');
  const [chatList, setChatList] = useState<ChatListDisclosure>({ kind: 'route' });
  // A route change hands the disclosure back to the route: opening a chat should show its siblings even
  // if the reader collapsed the group three screens ago.
  const [chatListRoute, setChatListRoute] = useState(pathname);
  if (chatListRoute !== pathname) {
    setChatListRoute(pathname);
    setChatList({ kind: 'route' });
  }
  const chatListOpen = chatList.kind === 'route' ? onChatRoute : chatList.open;
  const chatSessionsQuery = useListChatSessionsQuery(novelId ?? '', CHAT_LIST_PARAMS, inProject && chatListOpen);
  const recentSessions = chatSessionsQuery.data?.items ?? [];
  const openChat = openChatId(locationSearch);
  // Only when the open chat falls outside the recent few — the sidebar has to say where you are, and that
  // is the one case the list query cannot answer on its own.
  const pinnedQuery = useChatSessionQuery(novelId ?? '', openChat ?? '', inProject && chatListOpen && openChat != null && !recentSessions.some(s => s.id === openChat));

  const project = projectQuery.data;
  const status = statusQuery.data;
  const translation = translationQuery.data;
  const phase = isTranslation
    ? translationLifecycle(translation && { counts: translation.counts, glossary: translation.glossary, jobActive: translationJobActive(translation) })
    : lifecyclePhase(status, project?.kind);

  const badges: Record<string, NavLeaf['badge']> = {
    chapters: { count: status?.chaptersTotal ?? 0 },
    review: { count: reviewQuery.data?.drafts.length ?? 0, intent: 'warning' },
    proposals: { count: proposalsQuery.data?.items.length ?? 0, intent: 'warning' },
    translation: { count: translation?.glossary.suggested ?? 0, intent: 'warning' },
  };

  const options = projects.map(candidate => {
    const ownerTag = sharedOwnerTag(candidate);
    return {
      id: candidate.id,
      label: projectTitle(candidate),
      // The marker goes first: `.switcherCaption` is nowrap-ellipsis, so a trailing marker is the first
      // thing truncated — worst in the collapsed trigger showing the currently open project.
      caption: `${ownerTag ? `${ownerTag} · ` : ''}${projectKindTag(candidate.kind)} · #${candidate.id}`,
      imageUrl: candidate.coverUrl ?? undefined,
      color: projectDotColor(candidate),
    };
  });

  const toLeaf = (screen: ProjectScreen): NavLeaf => ({
    to: screen.to,
    params: { novelId: novelId ?? '' },
    label: screen.label,
    icon: screen.icon,
    badge: badges[screen.segment],
  });

  // D6: the one list that is genuinely navigation lives here rather than in a column of its own.
  const chatBranch = (screen: ProjectScreen): NavBranch => {
    const params = { novelId: novelId ?? '' };
    const rows = recentChats(recentSessions, pinnedQuery.data);
    const seeAll = allChatsLabel(chatSessionsQuery.data?.total ?? 0, rows.length);
    const items: NavLeaf[] =
      rows.length === 0 && !chatSessionsQuery.isLoading
        ? [{ id: 'chat-first', to: screen.to, params, search: { session: 'new' }, label: 'Start the first chat', indent: true }]
        : rows.map(session => ({ id: session.id, to: screen.to, params, search: { session: session.id }, label: chatTitle(session), indent: true, clamp: true }));
    if (seeAll) items.push({ id: 'chat-all', to: screen.to, params, search: { session: 'all' }, label: seeAll, indent: true });

    return {
      label: screen.label,
      icon: screen.icon,
      to: screen.to,
      params,
      action: (
        <IconButton
          size="sm"
          variant="ghost"
          aria-label="Start a new chat"
          icon={<PlusIcon size={14} />}
          onClick={() => void navigate({ to: screen.to, params, search: { session: 'new' } })}
        />
      ),
      open: chatListOpen,
      onOpenChange: open => setChatList({ kind: 'pinned', open }),
      items,
    };
  };

  const toNode = (screen: ProjectScreen): NavNode => (screen.segment === 'chat' ? chatBranch(screen) : toLeaf(screen));

  const isAdmin = useIsAdmin();
  const screens = useMemo(() => screensForWorkflow(project?.kind).filter(screen => !screen.adminOnly || isAdmin), [project?.kind, isAdmin]);
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
        sections: [{ items: screens.filter(screen => !screen.trailing).map(toNode) }, { items: screens.filter(screen => screen.trailing).map(toLeaf) }],
      }
    : {
        variant: 'sections',
        sections: [
          {
            items: [
              { to: '/', label: 'Projects', icon: <GridIcon />, exact: true },
              { to: '/ideas', label: 'Ideas', icon: <SparkIcon /> },
            ],
          },
          {
            label: 'Pinned',
            hidden: projects.length === 0,
            items: projects.slice(0, 3).map(pinned => ({ to: '/novels/$novelId/overview', params: { novelId: pinned.id }, label: projectTitle(pinned), icon: <BookIcon /> })),
          },
          { items: [{ to: '/settings', label: 'Settings', icon: <SettingsIcon /> }] },
        ],
      };

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];
    if (novelId) {
      for (const screen of screens) {
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
    items.push({ id: 'go-ideas', group: 'Go to', label: 'Ideas', icon: <SparkIcon />, onRun: () => navigate({ to: '/ideas' }) });
    items.push({ id: 'go-settings', group: 'Go to', label: 'Settings', icon: <SettingsIcon />, keywords: ['models', 'defaults'], onRun: () => navigate({ to: '/settings' }) });
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
  }, [navigate, novelId, projects, screens]);

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

  const paletteView = resolvePaletteView(palette, commands);

  const leafSegment = pathname.split('/').filter(Boolean).pop();
  const crumbLeaf = inProject && leafSegment != null ? SCREEN_LABEL.get(leafSegment) : undefined;
  const crumbRoot = inProject && project ? projectTitle(project) : inIdeas ? 'Ideas' : pathname === '/settings' ? 'Settings' : 'Projects';

  const saveIdeaName = (next: string): void => {
    if (!seedId) return;
    renameIdea.mutate(
      { title: next },
      {
        onSuccess: () => {
          applySeedName(queryClient, seedId, next);
          invalidateSeed(queryClient, seedId);
          setRenamingIdea(false);
        },
        onError: err => {
          toast.danger(err.message);
          setRenamingIdea(false);
        },
      },
    );
  };

  const ideaTitle = firstTitle([seedQuery.data?.name, seedQuery.data?.fields.workingTitle], 'Idea');
  const ideaCrumb = onIdeaStudio ? (
    renamingIdea ? (
      <IdeaRename compact name={ideaTitle} saving={renameIdea.isPending} onCommit={next => (next == null ? setRenamingIdea(false) : saveIdeaName(next))} />
    ) : (
      <>
        <span className={styles.crumbName} title={ideaTitle}>
          {ideaTitle}
        </span>
        <IconButton variant="ghost" size="sm" aria-label="Rename idea" icon={<EditIcon size={13} />} onClick={() => setRenamingIdea(true)} />
      </>
    )
  ) : undefined;

  const breadcrumb = onIdeaStudio ? (
    <span className={styles.crumbTrail}>
      <span className={styles.crumbRoot}>{crumbRoot} /</span>
      {ideaCrumb}
    </span>
  ) : crumbLeaf != null ? (
    `${crumbRoot} / ${crumbLeaf}`
  ) : (
    crumbRoot
  );

  return (
    <CommandScopeProvider onOpenScope={openScope} onScopeGone={dropScope}>
      <Chrome
        brand={{ icon: <BookIcon size={17} />, name: 'Novel Forge', to: '/' }}
        nav={nav}
        account={{
          name: userDisplayName(meQuery.data),
          items: [
            { id: 'projects', label: 'All projects', icon: <GridIcon />, onSelect: () => void navigate({ to: '/' }) },
            { id: 'settings', label: 'Settings', icon: <SettingsIcon />, onSelect: () => void navigate({ to: '/settings' }) },
          ],
          onSignOut: signOut,
        }}
        breadcrumb={breadcrumb}
        search={
          <>
            <button className={`nf-search ${styles.search}`} onClick={() => setPalette({ kind: 'global' })}>
              <SearchIcon size={15} />
              <span className={styles.searchLabel}>Search or run a command…</span>
              <Kbd keys="mod+k" />
            </button>
            {/* keyed on the view: the palette clears its query only when its own hotkey opens it, so an external open reuses the last one */}
            <CommandPalette
              key={paletteView.key}
              commands={paletteView.commands}
              open={paletteView.open}
              onOpenChange={next => setPalette(next ? { kind: 'global' } : { kind: 'closed' })}
              hotkey="mod+k"
              placeholder={paletteView.placeholder}
              emptyMessage={paletteView.emptyMessage}
            />
          </>
        }
        actions={inProject ? <JobsTray novelId={novelId} /> : undefined}
        utility={<ThemeToggle />}
        sidebarFooter={
          inProject && phase.total > 0 ? (
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
    </CommandScopeProvider>
  );
}
