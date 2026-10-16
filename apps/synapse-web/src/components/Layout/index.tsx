import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type PropsWithChildren, type ReactElement } from 'react';
import { Alert, IconButton, useTheme } from '@shadow-library/ui';
import { AppShell, type NavConfig } from '@shadow-library/ui/router';
import { userDisplayName } from '@shadow-library/web';

import { AliasIcon, CatalogIcon, MoonIcon, OverviewIcon, SunIcon, SynapseMark, UsageIcon } from '@/features/shared';
import { accessQueryOptions, type Capabilities, logout, meQuery, useCapabilities } from '@/lib';

import styles from './Layout.module.css';
import { OrgSwitcher } from './OrgSwitcher';

function navFor(capabilities: Capabilities): NavConfig {
  return {
    variant: 'sections',
    sections: [
      { label: 'Overview', items: [{ to: '/', label: 'Overview', icon: <OverviewIcon />, exact: true, hidden: !capabilities.readCatalog }] },
      {
        label: 'Catalog',
        hidden: !capabilities.readCatalog,
        items: [
          { to: '/catalog', label: 'Catalog editor', icon: <CatalogIcon /> },
          { to: '/aliases', label: 'Aliases', icon: <AliasIcon /> },
        ],
      },
      { label: 'Metering', hidden: !capabilities.readUsage, items: [{ to: '/usage', label: 'Usage', icon: <UsageIcon /> }] },
    ],
  };
}

function ThemeToggle(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton variant="ghost" size="sm" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} icon={dark ? <SunIcon /> : <MoonIcon />} onClick={toggleTheme} />
  );
}

export function Layout({ children }: PropsWithChildren): ReactElement {
  const navigate = useNavigate();
  const me = useQuery(meQuery);
  const capabilities = useCapabilities();
  const access = useQuery(accessQueryOptions());
  const stage = import.meta.env.DEV ? 'dev' : 'production';

  /** RP-initiated logout must replace the local bounce: routing to `/login` would leave the identity session live and sign straight back in. */
  const handleSignOut = async (): Promise<void> => {
    const result = await logout().catch(() => null);
    if (result?.redirectTo) return window.location.assign(result.redirectTo);
    await navigate({ to: '/login', search: { returnTo: '/' } });
  };

  return (
    <AppShell
      brand={{ icon: <SynapseMark />, name: 'Synapse', tagline: 'AI catalog', to: '/' }}
      nav={navFor(capabilities)}
      account={{ name: userDisplayName(me.data), email: me.data?.email, onSignOut: () => void handleSignOut() }}
      breadcrumb="Platform AI service"
      status={
        <div className={styles.envPill} title="Environment stage">
          <span className={styles.envDot} />
          <span className={styles.envLabel}>env</span>
          <span className={styles.envValue}>{stage}</span>
        </div>
      }
      actions={<OrgSwitcher />}
      utility={<ThemeToggle />}
    >
      {access.isError && !access.data ? (
        <Alert
          intent="warning"
          title="Your Synapse permissions couldn't be checked"
          action={{ label: 'Retry', onClick: () => void access.refetch() }}
          className={styles.accessNotice}
        >
          Controls are hidden until they can be. The server still decides what you may do.
        </Alert>
      ) : null}
      {children}
    </AppShell>
  );
}
