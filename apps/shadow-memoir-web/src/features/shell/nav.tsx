import { type NavConfig, type NavLeaf } from '@shadow-library/ui/router';

import { AiIcon, HeroIcon, HistoryIcon, InsightsIcon, LogIcon, MoneyIcon, PlanIcon, ReviewIcon, SettingsIcon, TodayIcon } from '@/components/icons';

/**
 * The five destinations the phone's bottom bar carries — capture and completion, in the order a day is
 * lived. Anything reached less than daily belongs in the sidebar, not here.
 */
export const PHONE_NAV: NavLeaf[] = [
  { to: '/', label: 'Today', icon: <TodayIcon size={16} />, exact: true },
  { to: '/plan', label: 'Plan', icon: <PlanIcon size={16} /> },
  { to: '/log', label: 'Log', icon: <LogIcon size={16} /> },
  { to: '/finance', label: 'Money', icon: <MoneyIcon size={16} /> },
  { to: '/hero', label: 'Hero', icon: <HeroIcon size={16} /> },
];

/**
 * The desktop sidebar, grouped by what the surface is for: the day, capture, and the reflection half of the
 * loop that a phone screen could never carry.
 */
export const DESKTOP_NAV: NavConfig = {
  variant: 'sections',
  sections: [
    {
      label: 'Day',
      items: [
        { to: '/', label: 'Today', icon: <TodayIcon size={16} />, exact: true },
        { to: '/plan', label: 'Planning Board', icon: <PlanIcon size={16} /> },
      ],
    },
    {
      label: 'Capture',
      items: [
        { to: '/log', label: 'Quick log', icon: <LogIcon size={16} /> },
        { to: '/finance', label: 'Money', icon: <MoneyIcon size={16} /> },
      ],
    },
    {
      label: 'Reflect',
      items: [
        { to: '/history', label: 'History', icon: <HistoryIcon size={16} /> },
        { to: '/insights', label: 'Insights', icon: <InsightsIcon size={16} /> },
        { to: '/review', label: 'Weekly Review', icon: <ReviewIcon size={16} /> },
        { to: '/ai', label: 'Ask', icon: <AiIcon size={16} /> },
      ],
    },
    {
      items: [
        { to: '/hero', label: 'Hero', icon: <HeroIcon size={16} /> },
        { to: '/settings', label: 'Settings', icon: <SettingsIcon size={16} /> },
      ],
    },
  ],
};
