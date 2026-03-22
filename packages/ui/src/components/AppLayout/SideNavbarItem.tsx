/**
 * Importing npm packages
 */
import { ActionIcon, Menu, NavLink, Tooltip } from '@mantine/core';

/**
 * Importing user defined packages
 */
import styles from './AppLayout.module.css';
import { useSideNavbarItem } from './hooks/use-side-navbar-item';
import type { NavItem } from './layout.types';

/**
 * Defining types
 */

interface SideNavbarItemProps {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}

/**
 * Declaring the constants
 */

export function SideNavbarItem({ item, collapsed, onNavigate }: SideNavbarItemProps) {
  const { isActive, hasChildren, hasActiveChild, handleClick, navigate } = useSideNavbarItem(item, onNavigate);

  /** Collapsed mode — icon only */
  if (collapsed) {
    if (hasChildren) {
      return (
        <Menu trigger='hover' position='right-start' offset={4}>
          <Menu.Target>
            <ActionIcon variant={hasActiveChild ? 'light' : 'subtle'} size='xl' onClick={handleClick} disabled={item.disabled} className={styles.collapsedItem}>
              <item.icon size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{item.label}</Menu.Label>
            {item.children?.map((child) => (
              <Menu.Item
                key={child.key ?? child.path ?? child.label}
                leftSection={<child.icon size={16} />}
                disabled={child.disabled}
                onClick={() => {
                  child.onClick?.();
                  if (child.path) navigate({ to: child.path });
                  onNavigate?.();
                }}
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
        <ActionIcon variant={isActive ? 'light' : 'subtle'} size='xl' onClick={handleClick} disabled={item.disabled} className={styles.collapsedItem}>
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
      onClick={hasChildren ? undefined : handleClick}
      defaultOpened={hasActiveChild}
      href={item.path}
    >
      {hasChildren && item.children?.map((child) => <SideNavbarItem key={child.key ?? child.path ?? child.label} item={child} collapsed={false} onNavigate={onNavigate} />)}
    </NavLink>
  );
}
