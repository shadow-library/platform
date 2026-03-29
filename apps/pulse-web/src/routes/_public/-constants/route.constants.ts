/**
 * Importing npm packages
 */
import { type NavItem } from '@shadow-library/ui';
import {
  FileText,
  Gauge,
  Globe,
  Inbox,
  LineChart,
  Lock,
  MessageCircleMore,
  Monitor,
  SendHorizontal,
  Settings,
  ShieldUser,
  Signpost,
  SlidersVertical,
  Unplug,
  User,
} from 'lucide-react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const navItems: NavItem[] = [
  {
    icon: Gauge,
    label: 'Dashboard',
    path: '/',
    exactMatch: true,
  },
  {
    icon: MessageCircleMore,
    label: 'Messaging',
    children: [
      {
        icon: Unplug,
        label: 'Providers',
        path: '/messaging/providers',
      },
      {
        icon: SendHorizontal,
        label: 'Senders',
        path: '/messaging/senders',
      },
      {
        icon: FileText,
        label: 'Templates',
        path: '/messaging/templates',
      },
    ],
  },
  {
    icon: Settings,
    label: 'Configurations',
    children: [
      {
        icon: Globe,
        label: 'Services',
        path: '/configuration/services',
      },
      {
        icon: SlidersVertical,
        label: 'Default Settings',
        path: '/configuration/default-settings',
      },
      {
        icon: Signpost,
        label: 'Routing Rules',
        path: '/configuration/routing-rules',
      },
    ],
  },
  {
    icon: Lock,
    label: 'Access Control',
    children: [
      {
        icon: User,
        label: 'Users',
        path: '/access-control/users',
      },
      {
        icon: ShieldUser,
        label: 'Roles & Permissions',
        path: '/access-control/roles-permissions',
      },
    ],
  },
  {
    icon: Monitor,
    label: 'Monitoring',
    children: [
      {
        icon: LineChart,
        label: 'Metrics',
        path: '/monitoring/metrics',
      },
      {
        icon: Inbox,
        label: 'Dev Inbox',
        path: '/monitoring/dev-inbox',
      },
    ],
  },
];
