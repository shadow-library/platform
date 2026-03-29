/**
 * Importing npm packages
 */
import { Divider, Stack, Text } from '@mantine/core';

/**
 * Importing user defined packages
 */
import { type VoidFn } from '@/types';

import styles from './AppLayout.module.css';
import { type NavGroup } from './layout.types';
import { SideNavbarItem } from './SideNavbarItem';

/**
 * Defining types
 */

interface SideNavbarGroupProps {
  group: NavGroup;
  collapsed: boolean;
  showDivider: boolean;
  onNavigate?: VoidFn;
}

/**
 * Declaring the constants
 */

export function SideNavbarGroup({ group, collapsed, showDivider, onNavigate }: SideNavbarGroupProps) {
  return (
    <Stack gap={4}>
      {showDivider && <Divider className={styles.navGroupDivider} />}
      {!collapsed && (
        <Text size='xs' fw={600} c='dimmed' tt='uppercase' px={4} pt={4} style={{ letterSpacing: '0.07em' }}>
          {group.group}
        </Text>
      )}
      {group.items.map(item => (
        <SideNavbarItem key={item.key ?? item.path ?? item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </Stack>
  );
}
