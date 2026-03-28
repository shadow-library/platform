/**
 * Importing npm packages
 */
import { useLocation } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { isNavGroup } from '../app-layout.utils';
import { type NavGroup, type NavItem } from '../layout.types';

/**
 * Declaring the constants
 */

function isRouteActive(path: string, current: string, exact: boolean): boolean {
  return exact ? current === path : current === path || current.startsWith(`${path}/`);
}

function findActiveLabel(items: NavItem[], current: string): string | null {
  for (const item of items) {
    if (item.children?.length) {
      const childLabel = findActiveLabel(item.children, current);
      if (childLabel) return childLabel;
    }
    if (item.path && isRouteActive(item.path, current, item.exactMatch ?? false)) {
      return item.label;
    }
  }
  return null;
}

function flattenNavItems(navItems: (NavItem | NavGroup)[]): NavItem[] {
  return navItems.flatMap(item => (isNavGroup(item) ? item.items : [item]));
}

export function useActiveNavLabel(navItems: (NavItem | NavGroup)[]): string | null {
  const { pathname } = useLocation();
  return findActiveLabel(flattenNavItems(navItems), pathname);
}
