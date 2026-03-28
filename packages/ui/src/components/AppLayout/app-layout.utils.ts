/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type NavGroup, type NavItem } from './layout.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
  return 'group' in item && 'items' in item;
}
