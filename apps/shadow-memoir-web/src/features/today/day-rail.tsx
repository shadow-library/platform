import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button, Card } from '@shadow-library/ui';

import { type ActivityEntry, type QuickLogTile, type StreakBoardEntry, type UpcomingEntry } from '@/lib/data';

import { outcomeTone } from '../quests/quest-presenters';
import styles from './today.module.css';

export interface DayRailProps {
  quickLogs: QuickLogTile[];
  streaks: StreakBoardEntry[];
  upcoming: UpcomingEntry[];
  activity: ActivityEntry[];
}

export function DayRail({ quickLogs, streaks, upcoming, activity }: DayRailProps): ReactElement {
  return (
    <div className={styles.rail}>
      <Card padding="md">
        <h2 className={styles.railTitle}>Quick logs</h2>
        <div className={styles.tileGrid}>
          {quickLogs.map(tile => (
            <Link key={tile.id} to={tile.to} className={styles.tile}>
              <span className={styles.tileLabel}>{tile.label}</span>
              <span className={styles.tileValue}>{tile.value}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card padding="md">
        <div className={styles.railHeader}>
          <h2 className={styles.railTitle}>Streaks</h2>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/insights">All</Link>
          </Button>
        </div>
        <ul className={styles.streakList}>
          {streaks.map(streak => (
            <li key={streak.questId}>
              <div className={styles.streakHead}>
                <span className={styles.streakName}>{streak.questName}</span>
                <span className={styles.mono}>{streak.label}</span>
              </div>
              <div className={styles.streakWeek} aria-hidden>
                {streak.week.map((state, index) => (
                  <span key={index} className={styles.streakDay} data-tone={outcomeTone(state)} />
                ))}
              </div>
              {streak.note ? <p className={styles.railNote}>{streak.note}</p> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md">
        <h2 className={styles.railTitle}>Coming up</h2>
        <ul className={styles.upcomingList}>
          {upcoming.map(entry => (
            <li key={entry.id} className={styles.upcomingRow}>
              <span className={styles.upcomingWhen}>{entry.when}</span>
              <span>
                <span className={styles.upcomingTitle}>{entry.title}</span>
                <span className={styles.railNote}>{entry.meta}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md">
        <h2 className={styles.railTitle}>Recent activity</h2>
        <ul className={styles.activityList}>
          {activity.map(entry => (
            <li key={entry.id} className={styles.activityRow}>
              <span className={styles.dot} data-rewarded={entry.rewarded} aria-hidden />
              <span className={styles.activityText}>
                {entry.text} <span className={styles.activityWhen}>· {entry.when}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.railFooter}>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/history">Full history</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
