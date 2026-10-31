import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { BellIcon, Breadcrumbs, cn, IconButton, Spinner } from '@shadow-library/ui';
import { AppShell, type NavConfig } from '@shadow-library/ui/router';

import { BrandGlyph, BuildingIcon, GridIcon, MailIcon, MonitorIcon, PlugIcon, ShieldCheckIcon, TerminalIcon, UserIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/si';
import { myOrganisationsQueryOptions, orgAccessOf, useAdminContextQuery, useMeQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import { CrumbLeafContext } from './crumb-leaf';
import { ORG_OVERVIEW_PATH, orgNavConfig } from './org-nav';
import { accountCrumbs, type Crumb, type CrumbLeaf, orgCrumbs } from './portal-crumbs';
import styles from './portal-shell.module.css';

/** `isStaff` gates the platform section — an admin whose /admin/context grants any permission. */
function accountNavConfig(isStaff: boolean): NavConfig {
  return {
    variant: 'sections',
    sections: [
      {
        label: 'Account',
        items: [
          { to: '/account', label: 'Overview', icon: <GridIcon size={18} />, exact: true },
          { to: '/account/security', label: 'Security', icon: <ShieldCheckIcon size={18} /> },
          { to: '/account/sessions', label: 'Sessions & devices', icon: <MonitorIcon size={18} /> },
          { to: '/account/contacts', label: 'Emails & phones', icon: <MailIcon size={18} /> },
          { to: '/account/profile', label: 'Profile', icon: <UserIcon size={18} /> },
          { to: '/applications', label: 'My applications', icon: <GridIcon size={18} /> },
          { to: '/account/connected', label: 'Connected apps', icon: <PlugIcon size={18} /> },
        ],
      },
      { label: 'Organizations', items: [{ to: '/organizations', label: 'My organizations', icon: <BuildingIcon size={18} /> }] },
      { label: 'Platform', hidden: !isStaff, items: [{ to: '/console', label: 'Admin console', icon: <TerminalIcon size={18} /> }] },
    ],
  };
}

function CrumbBar({ crumbs }: { crumbs: Crumb[] }): React.JSX.Element {
  return (
    <Breadcrumbs hideAncestorsBelow="sm">
      {crumbs.map((crumb, index) =>
        crumb.kind === 'current' ? (
          <Breadcrumbs.Item key={index} current>
            {crumb.label}
          </Breadcrumbs.Item>
        ) : (
          <Breadcrumbs.Item key={index} asChild>
            <Link to={crumb.to} params={crumb.params}>
              {crumb.label}
            </Link>
          </Breadcrumbs.Item>
        ),
      )}
    </Breadcrumbs>
  );
}

export function PortalShell({ children }: { children: ReactNode }): React.JSX.Element {
  const me = useMeQuery();
  const adminContext = useAdminContextQuery();
  const navigate = useNavigate();
  const signout = useSignoutMutation();
  const { pathname } = useLocation();
  const matchRoute = useMatchRoute();
  const orgMatch = matchRoute({ to: ORG_OVERVIEW_PATH, fuzzy: true });
  const orgId = orgMatch === false ? undefined : orgMatch.orgId;
  const organisations = useQuery({ ...myOrganisationsQueryOptions(), enabled: orgId != null });
  const [crumbLeaf, setCrumbLeaf] = useState<CrumbLeaf>();

  useEffect(() => {
    if (me.isError) navigate({ to: '/login' });
  }, [me.isError, navigate]);

  if (me.isLoading || !me.data)
    return (
      <div className={cn(styles.gate, 'min-h-screen')}>
        <Spinner size="lg" label="Loading your account" />
      </div>
    );

  const user = me.data;
  const elevated = user.aal === 'AAL2' || user.elevated;
  let nav = accountNavConfig((adminContext.data?.permissions.length ?? 0) > 0);
  let crumbs = accountCrumbs(nav, pathname);
  if (orgId != null) {
    const { org, canManage } = orgAccessOf(organisations.data, orgId);
    nav = orgNavConfig({
      orgId,
      org,
      canManage,
      organisations: organisations.data?.organisations ?? [],
      loading: organisations.isLoading,
      onSelect: id => navigate({ to: ORG_OVERVIEW_PATH, params: { orgId: id } }),
      onShowAll: () => navigate({ to: '/organizations' }),
    });
    crumbs = orgCrumbs({ nav, orgId, orgName: org?.name ?? 'Organization', pathname, leaf: crumbLeaf });
  }

  return (
    <CrumbLeafContext.Provider value={setCrumbLeaf}>
      <AppShell
        brand={{ icon: <BrandGlyph />, name: 'Shadow Identity', to: '/account' }}
        nav={nav}
        account={{
          name: displayName(user),
          email: user.email ?? undefined,
          onSignOut: () => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) }),
        }}
        breadcrumb={<CrumbBar crumbs={crumbs} />}
        status={
          <span className={styles.aalBadge} data-elevated={elevated || undefined}>
            <ShieldCheckIcon size={12} />
            {elevated ? 'AAL2 · MFA' : 'AAL1'}
          </span>
        }
        actions={<IconButton variant="ghost" size="sm" aria-label="Notifications" icon={<BellIcon size={18} />} />}
        utility={<ThemeToggle />}
      >
        {children}
      </AppShell>
    </CrumbLeafContext.Provider>
  );
}
