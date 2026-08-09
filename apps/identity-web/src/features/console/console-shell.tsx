import { useLocation, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { Button, Spinner } from '@shadow-library/ui';
import { AppShell, type NavConfig } from '@shadow-library/ui/router';

import { ArrowLeftIcon, BrandGlyph, GridIcon, KeyRoundIcon, LayersIcon, LinkIcon, ShieldCheckIcon, UserIcon, UsersIcon, WebhookIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/si';
import { useMeQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import styles from './console-shell.module.css';

const NAV: NavConfig = {
  variant: 'sections',
  sections: [
    { label: 'Directory', items: [{ to: '/console/users', label: 'Users', icon: <UsersIcon size={18} /> }] },
    {
      label: 'Applications',
      items: [
        { to: '/console/applications', label: 'Applications', icon: <GridIcon size={18} /> },
        { to: '/console/saml', label: 'SAML providers', icon: <LinkIcon size={18} /> },
      ],
    },
    {
      label: 'Access',
      items: [
        { to: '/console/authentication', label: 'Authentication', icon: <KeyRoundIcon size={18} /> },
        { to: '/console/roles', label: 'Roles & permissions', icon: <ShieldCheckIcon size={18} /> },
        { to: '/console/webhooks', label: 'Webhooks', icon: <WebhookIcon size={18} /> },
      ],
    },
  ],
};

const CRUMB = new Map(NAV.sections.flatMap(section => section.items).map(item => ('to' in item ? [item.to, item.label] : [item.label, item.label])));

export function ConsoleShell({ children }: { children: ReactNode }): React.JSX.Element {
  const me = useMeQuery();
  const navigate = useNavigate();
  const signout = useSignoutMutation();
  const { pathname } = useLocation();

  useEffect(() => {
    if (me.isError) navigate({ to: '/login' });
  }, [me.isError, navigate]);

  if (me.isLoading || !me.data)
    return (
      <div className={styles.gate}>
        <Spinner size="lg" label="Loading console" />
      </div>
    );

  const user = me.data;
  const leaf = CRUMB.get(pathname);

  return (
    <AppShell
      brand={{ icon: <BrandGlyph />, name: 'Shadow Identity', tagline: 'Operator console', to: '/console/users' }}
      nav={NAV}
      tone="warning"
      account={{
        name: displayName(user),
        email: user.email ?? undefined,
        items: [{ id: 'account', label: 'Back to your account', icon: <UserIcon size={16} />, onSelect: () => navigate({ to: '/account' }) }],
        onSignOut: () => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) }),
      }}
      breadcrumb={leaf != null ? `Operator console / ${leaf}` : 'Operator console'}
      status={
        <span className={styles.privileged}>
          <LayersIcon size={12} />
          Privileged access
        </span>
      }
      /* The console is a detour out of the portal, so leaving it is a first-class action rather than a
         menu entry. On a phone the bar has no room for it and the account menu carries the exit. */
      actions={
        <span className={styles.backAction}>
          <Button variant="ghost" size="sm" prefix={<ArrowLeftIcon size={15} />} onClick={() => navigate({ to: '/account' })}>
            Back to dashboard
          </Button>
        </span>
      }
      utility={<ThemeToggle />}
    >
      {children}
    </AppShell>
  );
}
