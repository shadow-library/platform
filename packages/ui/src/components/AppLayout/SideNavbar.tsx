/**
 * Importing npm packages
 */
import { ActionIcon, AppShell, ScrollArea, Stack, Tooltip } from '@mantine/core';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Importing user defined packages
 */
import { SideNavbarItem } from './SideNavbarItem';
import { NavItem } from './layout.types';
import styles from './AppLayout.module.css';

/**
 * Defining types
 */

interface SideNavbarProps {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}

/**
 * Declaring the constants
 */

export function SideNavbar({ items, collapsed, onToggleCollapsed, onNavigate }: SideNavbarProps) {
  return (
    <>
      <AppShell.Section grow component={ScrollArea} scrollbarSize={6}>
        <Stack gap={4} p={collapsed ? 'xs' : 'sm'} align={collapsed ? 'center' : 'stretch'}>
          {items.map((item) => (
            <SideNavbarItem key={item.key ?? item.path ?? item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </Stack>
      </AppShell.Section>

      <AppShell.Section
        p={collapsed ? 'xs' : 'sm'}
        className={`${styles.navToggleSection} ${collapsed ? styles.navToggleSectionCollapsed : ''}`}
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
