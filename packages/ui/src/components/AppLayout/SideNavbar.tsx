/**
 * Importing npm packages
 */
import { ActionIcon, AppShell, CloseButton, Group, ScrollArea, Stack, Title, Tooltip, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { clsx } from 'clsx/lite';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Importing user defined packages
 */
import { type VoidFn } from '@/types';

import { Logo } from '../Logo';
import styles from './AppLayout.module.css';
import { isNavGroup } from './app-layout.utils';
import { type NavGroup, type NavItem } from './layout.types';
import { SideNavbarGroup } from './SideNavbarGroup';
import { SideNavbarItem } from './SideNavbarItem';

/**
 * Defining types
 */

interface SideNavbarProps {
  items: (NavItem | NavGroup)[];
  collapsed: boolean;
  onToggleCollapsed: VoidFn;
  onNavigate?: VoidFn;
  onCloseMobile?: VoidFn;
  appName?: string;
}

/**
 * Declaring the constants
 */

export function SideNavbar({ items, collapsed, onToggleCollapsed, onNavigate, onCloseMobile, appName }: SideNavbarProps) {
  const theme = useMantineTheme();
  const isDesktop = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`);
  const effectiveCollapsed = isDesktop !== false && collapsed;

  return (
    <>
      <AppShell.Section className={styles.logoSection} p={effectiveCollapsed ? 'xs' : 'sm'}>
        <Group justify={effectiveCollapsed ? 'center' : 'space-between'} w='100%' h='100%' wrap='nowrap'>
          <Group gap='sm' wrap='nowrap' align='center' style={{ minWidth: 0 }}>
            <div className={styles.brandIcon}>
              <Logo variant='icon' height='35px' />
            </div>
            <Title order={1} tt='uppercase' lineClamp={1} c='cyan' lts={5}>
              {appName}
            </Title>
          </Group>
          <CloseButton hiddenFrom='sm' onClick={onCloseMobile} aria-label='Close navigation' />
        </Group>
      </AppShell.Section>

      <AppShell.Section grow component={ScrollArea} scrollbarSize={6}>
        <Stack gap={4} p={effectiveCollapsed ? 'xs' : 'sm'} align={effectiveCollapsed ? 'center' : 'stretch'}>
          {items.map((entry, index) =>
            isNavGroup(entry) ? (
              <SideNavbarGroup key={entry.group} group={entry} collapsed={effectiveCollapsed} showDivider={index > 0} onNavigate={onNavigate} />
            ) : (
              <SideNavbarItem key={entry.key ?? entry.path ?? entry.label} item={entry} collapsed={effectiveCollapsed} onNavigate={onNavigate} />
            ),
          )}
        </Stack>
      </AppShell.Section>

      <AppShell.Section
        p={effectiveCollapsed ? 'xs' : 'sm'}
        className={clsx(styles.navToggleSection, effectiveCollapsed && styles.navToggleSectionCollapsed)}
        hiddenFrom={undefined}
        visibleFrom='sm'
      >
        <Tooltip label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} position='right'>
          <ActionIcon onClick={onToggleCollapsed} size='md' aria-label='Toggle sidebar'>
            {effectiveCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </ActionIcon>
        </Tooltip>
      </AppShell.Section>
    </>
  );
}
