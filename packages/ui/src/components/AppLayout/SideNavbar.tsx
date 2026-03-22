/**
 * Importing npm packages
 */
import { ActionIcon, AppShell, CloseButton, Group, ScrollArea, Stack, Tooltip } from '@mantine/core';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Importing user defined packages
 */
import { type Alphabet, Logo } from '../Logo';
import styles from './AppLayout.module.css';
import { type NavItem } from './layout.types';
import { SideNavbarItem } from './SideNavbarItem';

/**
 * Defining types
 */

interface SideNavbarProps {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
  productName?: Alphabet[];
  onCloseMobile?: () => void;
}

/**
 * Declaring the constants
 */

export function SideNavbar({ items, collapsed, onToggleCollapsed, onNavigate, productName, onCloseMobile }: SideNavbarProps) {
  return (
    <>
      <AppShell.Section className={styles.logoSection} p={collapsed ? 'xs' : 'sm'}>
        <Group justify='space-between' w='100%' h='100%' wrap='nowrap'>
          <div className={styles.logoContainer}>
            <Logo variant='icon' productName={collapsed ? undefined : productName} />
          </div>
          <CloseButton hiddenFrom='sm' onClick={onCloseMobile} aria-label='Close navigation' />
        </Group>
      </AppShell.Section>

      <AppShell.Section grow component={ScrollArea} scrollbarSize={6}>
        <Stack gap={4} p={collapsed ? 'xs' : 'sm'} align={collapsed ? 'center' : 'stretch'}>
          {items.map(item => (
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
