/**
 * Importing npm packages
 */
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { Bell, BookOpen, FileText, Home, LogOut, Package, Settings, Shield, User, Users } from 'lucide-react';
import { type JSX } from 'react';

/**
 * Importing user defined packages
 */
import { type NavGroup, type NavItem } from '../layout.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const sampleNavItems: NavItem[] = [
  { label: 'Dashboard', icon: Home, path: '/', exactMatch: true },
  { label: 'Projects', icon: Package, path: '/projects' },
  {
    label: 'Users',
    icon: Users,
    children: [
      { label: 'All Users', icon: Users, path: '/users/all' },
      { label: 'Roles', icon: Shield, path: '/users/roles' },
    ],
  },
  {
    label: 'Content',
    icon: BookOpen,
    children: [
      { label: 'Articles', icon: FileText, path: '/content/articles' },
      { label: 'Pages', icon: FileText, path: '/content/pages' },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    children: [
      { label: 'General', icon: Settings, path: '/settings/general' },
      { label: 'Notifications', icon: Bell, path: '/settings/notifications' },
      { label: 'Security', icon: Shield, path: '/settings/security' },
    ],
  },
];

export const sampleUser = {
  name: 'Leander Paul',
  email: 'leander@shadow-apps.com',
  actions: [
    { label: 'Profile', icon: User, onClick: () => {} },
    { label: 'Settings', icon: Settings, onClick: () => {} },
    { label: 'Logout', icon: LogOut, onClick: () => {}, color: 'red', divider: true },
  ],
};

export const sampleNotifications = { count: 3, onClick: () => {} };

export const groupedNavItems: (NavItem | NavGroup)[] = [
  {
    group: 'Main',
    items: [
      { label: 'Dashboard', icon: Home, path: '/', exactMatch: true },
      { label: 'Projects', icon: Package, path: '/projects' },
    ],
  },
  {
    group: 'Management',
    items: [
      {
        label: 'Users',
        icon: Users,
        children: [
          { label: 'All Users', icon: Users, path: '/users/all' },
          { label: 'Roles', icon: Shield, path: '/users/roles' },
        ],
      },
      {
        label: 'Content',
        icon: BookOpen,
        children: [
          { label: 'Articles', icon: FileText, path: '/content/articles' },
          { label: 'Pages', icon: FileText, path: '/content/pages' },
        ],
      },
    ],
  },
  {
    group: 'System',
    items: [
      {
        label: 'Settings',
        icon: Settings,
        children: [
          { label: 'General', icon: Settings, path: '/settings/general' },
          { label: 'Notifications', icon: Bell, path: '/settings/notifications' },
          { label: 'Security', icon: Shield, path: '/settings/security' },
        ],
      },
    ],
  },
];

export function withRouter(initialPath = '/') {
  return function RouterDecorator(Story: React.ComponentType): JSX.Element {
    const component = () => <Story />;
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const getParentRoute = () => rootRoute;
    const indexRoute = createRoute({ getParentRoute, path: '/', component });
    const catchAllRoute = createRoute({ getParentRoute, path: '$', component });

    const routeTree = rootRoute.addChildren([indexRoute, catchAllRoute]);
    const history = createMemoryHistory({ initialEntries: [initialPath] });
    const router = createRouter({ routeTree, history });

    return <RouterProvider router={router} />;
  };
}
