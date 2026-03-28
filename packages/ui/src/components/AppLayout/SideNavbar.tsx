/**
 * Importing npm packages
 */
import { ActionIcon, AppShell, CloseButton, Group, ScrollArea, Stack, Title, Tooltip } from '@mantine/core';
import { clsx } from 'clsx/lite';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Importing user defined packages
 */
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
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  onCloseMobile?: () => void;
  appName?: string;
}

/**
 * Declaring the constants
 */

export function SideNavbar({ items, collapsed, onToggleCollapsed, onNavigate, onCloseMobile, appName }: SideNavbarProps) {
  return (
    <>
      <AppShell.Section className={styles.logoSection} p={collapsed ? 'xs' : 'sm'}>
        <Group justify={collapsed ? 'center' : 'space-between'} w='100%' h='100%' wrap='nowrap'>
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
        <Stack gap={4} p={collapsed ? 'xs' : 'sm'} align={collapsed ? 'center' : 'stretch'}>
          {items.map((entry, index) =>
            isNavGroup(entry) ? (
              <SideNavbarGroup key={entry.group} group={entry} collapsed={collapsed} showDivider={index > 0} onNavigate={onNavigate} />
            ) : (
              <SideNavbarItem key={entry.key ?? entry.path ?? entry.label} item={entry} collapsed={collapsed} onNavigate={onNavigate} />
            ),
          )}
        </Stack>
      </AppShell.Section>

      <AppShell.Section
        p={collapsed ? 'xs' : 'sm'}
        className={clsx(styles.navToggleSection, collapsed && styles.navToggleSectionCollapsed)}
        hiddenFrom={undefined}
        visibleFrom='sm'
      >
        <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} position='right'>
          <ActionIcon onClick={onToggleCollapsed} size='md' aria-label='Toggle sidebar'>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </ActionIcon>
        </Tooltip>
      </AppShell.Section>
    </>
  );
}
