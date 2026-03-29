/**
 * Importing npm packages
 */
import { ActionIcon, Menu, NavLink, Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { type VoidFn } from '@/types';

import styles from './AppLayout.module.css';
import { useSideNavbarItem } from './hooks/use-side-navbar-item';
import { type NavItem } from './layout.types';

/**
 * Defining types
 */

interface SideNavbarItemProps {
  item: NavItem;
  collapsed: boolean;
  isChild?: boolean;
  onNavigate?: VoidFn;
}

/**
 * Declaring the constants
 */

export function SideNavbarItem({ item, collapsed, isChild, onNavigate }: SideNavbarItemProps) {
  const { isActive, hasChildren, hasActiveChild, onClick } = useSideNavbarItem(item, onNavigate);
  const routeProps = item.path ? { component: Link, to: item.path } : {};

  /** Collapsed mode — icon only */
  if (collapsed) {
    if (hasChildren) {
      return (
        <Menu trigger='hover' position='right-start' offset={4}>
          <Menu.Target>
            <ActionIcon
              variant={hasActiveChild ? 'light' : 'subtle'}
              size='xl'
              onClick={onClick}
              disabled={item.disabled}
              className={styles.collapsedItem}
              aria-label={item.label}
              {...routeProps}
            >
              <item.icon size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{item.label}</Menu.Label>
            {item.children?.map(child => (
              <Menu.Item
                key={child.key ?? child.path ?? child.label}
                leftSection={<child.icon size={16} />}
                disabled={child.disabled}
                onClick={onClick}
                {...(child.path ? { component: Link, to: child.path } : {})}
              >
                {child.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      );
    }

    return (
      <Tooltip label={item.label} position='right' offset={8}>
        <ActionIcon
          variant={isActive ? 'light' : 'subtle'}
          size='xl'
          onClick={onClick}
          disabled={item.disabled}
          className={styles.collapsedItem}
          aria-label={item.label}
          {...routeProps}
        >
          <item.icon size={20} />
        </ActionIcon>
      </Tooltip>
    );
  }

  /** Expanded mode */
  return (
    <NavLink
      label={item.label}
      leftSection={<item.icon size={18} />}
      active={isActive || hasActiveChild}
      disabled={item.disabled}
      onClick={hasChildren ? undefined : onClick}
      defaultOpened={hasActiveChild}
      className={isChild ? styles.childNavLink : undefined}
      {...routeProps}
    >
      {hasChildren && item.children?.map(child => <SideNavbarItem key={child.key ?? child.path ?? child.label} item={child} collapsed={false} isChild onNavigate={onNavigate} />)}
    </NavLink>
  );
}
