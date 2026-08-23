import { Link, Outlet } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import styles from './quick-logs.module.css';

const DESTINATIONS = [
  { to: '/log', label: 'Journal', exact: true },
  { to: '/log/meals', label: 'Meals', exact: false },
  { to: '/log/weight', label: 'Weight', exact: false },
  { to: '/log/health', label: 'Body & health', exact: false },
  { to: '/log/sidequests', label: 'Side quests', exact: false },
] as const;

/**
 * The capture hub. Each surface underneath is a separate route so a launcher shortcut, a deep link or the
 * back button all land where the owner expects — the strip is navigation, not a tab widget holding state.
 */
export function QuickLogScreen(): ReactElement {
  return (
    <div className={styles.hub}>
      <header className={styles.header}>
        <h1 className={styles.title}>Quick log</h1>
        <p className={styles.meta}>Journal, meals, weight, the manual health metrics and side quests. Each entry is meant to take under ten seconds.</p>
      </header>

      <nav className={styles.subnav} aria-label="Quick log surfaces">
        {DESTINATIONS.map(destination => (
          <Link key={destination.to} to={destination.to} activeOptions={{ exact: destination.exact }} className={styles.subnavItem}>
            {destination.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
