import { useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { IconButton, Spinner } from '@shadow-library/ui';
import { AppShell, type NavConfig } from '@shadow-library/ui/router';

import { BellIcon, BrandGlyph, BuildingIcon, GridIcon, MailIcon, MonitorIcon, PlugIcon, ShieldCheckIcon, TerminalIcon, UserIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/si';
import { useAdminContextQuery, useMeQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import styles from './portal-shell.module.css';

/** `isStaff` gates the platform section — an admin whose /admin/context grants any permission. */
function navConfig(isStaff: boolean): NavConfig {
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

function activeLabel(nav: NavConfig, pathname: string): string {
  const leaves = nav.sections.filter(section => section.hidden !== true).flatMap(section => section.items);
  const match = leaves.find(item => 'to' in item && (item.exact === true ? pathname === item.to : pathname.startsWith(item.to)));
  return match != null && 'label' in match ? match.label : 'Account';
}

/**
 * The account-portal chrome. `AppShell` owns the rail, the top bar, the account menu, and the sub-md nav
 * drawer; the portal supplies its destinations and the session-assurance badge, plus the auth gate — an
 * unauthenticated visitor is bounced to the hosted sign-in.
 */
export function PortalShell({ children }: { children: ReactNode }): React.JSX.Element {
  const me = useMeQuery();
  const adminContext = useAdminContextQuery();
  const navigate = useNavigate();
  const signout = useSignoutMutation();
  const { pathname } = useLocation();

  useEffect(() => {
    if (me.isError) navigate({ to: '/login' });
  }, [me.isError, navigate]);

  if (me.isLoading || !me.data)
    return (
      <div className={styles.gate}>
        <Spinner size="lg" label="Loading your account" />
      </div>
    );

  const user = me.data;
  const nav = navConfig((adminContext.data?.permissions.length ?? 0) > 0);
  const elevated = user.aal === 'AAL2' || user.elevated;

  return (
    <AppShell
      brand={{ icon: <BrandGlyph />, name: 'Shadow Identity', to: '/account' }}
      nav={nav}
      account={{
        name: displayName(user),
        email: user.email ?? undefined,
        onSignOut: () => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) }),
      }}
      breadcrumb={`Account / ${activeLabel(nav, pathname)}`}
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
  );
}
