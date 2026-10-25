import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type PropsWithChildren, type ReactElement } from 'react';
import { Alert, IconButton, OrganisationSwitcher, useTheme } from '@shadow-library/ui';
import { AppShell, type NavConfig, type NavLeaf, type NavSection } from '@shadow-library/ui/router';
import { userDisplayName } from '@shadow-library/web';
import { useOrganisationSwitch } from '@shadow-library/web/router';

import { ChangeFlowProvider } from '@/features/changes';
import {
  AliasIcon,
  BudgetIcon,
  CatalogIcon,
  FeaturesIcon,
  HistoryIcon,
  KeyIcon,
  ModelIcon,
  MoonIcon,
  OverviewIcon,
  ProviderIcon,
  SunIcon,
  SynapseMark,
  UsageIcon,
} from '@/features/shared';
import { type Capabilities, logout, meQuery, organisationsQueryOptions, switchOrganisation, useAccessCheck, useCapabilities } from '@/lib';

import styles from './Layout.module.css';

function section(label: string, items: NavLeaf[]): NavSection {
  return { label, items, hidden: items.every(item => item.hidden) };
}

function navFor(capabilities: Capabilities): NavConfig {
  const catalogHidden = !capabilities.readCatalog;
  const usageHidden = !capabilities.readUsage;
  return {
    variant: 'sections',
    sections: [
      section('Spend', [
        { to: '/', label: 'Overview', icon: <OverviewIcon />, exact: true, hidden: usageHidden },
        { to: '/usage', label: 'Usage', icon: <UsageIcon />, hidden: usageHidden },
        { to: '/budgets', label: 'Budgets', icon: <BudgetIcon />, hidden: usageHidden },
      ]),
      section('AI features', [
        { to: '/features', label: 'Features', icon: <FeaturesIcon />, hidden: catalogHidden },
        { to: '/aliases', label: 'Model names', icon: <AliasIcon />, hidden: catalogHidden },
        { to: '/models', label: 'Models', icon: <ModelIcon />, hidden: catalogHidden },
      ]),
      section('Changes', [{ to: '/history', label: 'History', icon: <HistoryIcon />, hidden: catalogHidden }]),
      section('Infrastructure', [
        { to: '/providers', label: 'Providers', icon: <ProviderIcon />, hidden: catalogHidden },
        { to: '/credentials', label: 'Credentials', icon: <KeyIcon />, hidden: !capabilities.manageCredentials },
        { to: '/advanced', label: 'Advanced editor', icon: <CatalogIcon />, hidden: catalogHidden },
      ]),
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
  const access = useAccessCheck();
  const organisationSwitch = useOrganisationSwitch({ organisationsQueryOptions, switchOrganisation });
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
      actions={<OrganisationSwitcher {...organisationSwitch.switcher} />}
      utility={<ThemeToggle />}
    >
      {organisationSwitch.error ? (
        <Alert intent="danger" title="Your organisation wasn't switched" onDismiss={organisationSwitch.dismissError} className={styles.notice}>
          {organisationSwitch.error.message}
        </Alert>
      ) : null}
      {access.status === 'unavailable' ? (
        <Alert intent="warning" title="Your Synapse permissions couldn't be checked" className={styles.notice}>
          Controls are hidden until they can be. The server still decides what you may do.
        </Alert>
      ) : null}
      <ChangeFlowProvider>{children}</ChangeFlowProvider>
    </AppShell>
  );
}
