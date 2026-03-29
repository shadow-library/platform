/**
 * Importing npm packages
 */
import { useLocation } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { type VoidFn } from '@/types';

import { type NavItem } from '../layout.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function isRouteActive(itemPath: string, currentPath: string, exactMatch: boolean): boolean {
  if (exactMatch) return currentPath === itemPath;
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

function isItemOrChildActive(item: NavItem, currentPath: string): boolean {
  if (item.path && isRouteActive(item.path, currentPath, item.exactMatch ?? false)) return true;
  return item.children?.some(child => isItemOrChildActive(child, currentPath)) ?? false;
}

export function useSideNavbarItem(item: NavItem, onNavigate?: VoidFn) {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = item.path ? isRouteActive(item.path, currentPath, item.exactMatch ?? false) : false;
  const hasChildren = item.children && item.children.length > 0;
  const hasActiveChild = hasChildren ? isItemOrChildActive(item, currentPath) : false;
  const onClick = (e: React.MouseEvent) => {
    item.onClick?.(e);
    if (item.path) onNavigate?.();
  };

  return { isActive, hasChildren, hasActiveChild, onClick };
}
