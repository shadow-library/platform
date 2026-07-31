/**
 * Importing npm packages
 */
import { type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import { formatDay } from '@/features/shared';
import { type NotificationStatsWithDate } from '@/lib';

import styles from './Dashboard.module.css';

/**
 * Declaring constants
 */
const W = 900;
const H = 240;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_H = H - PAD_T - PAD_B;

const SEGMENTS: { key: 'succeeded' | 'pending' | 'failed'; fill: string }[] = [
  { key: 'succeeded', fill: 'var(--sh-success-solid)' },
  { key: 'pending', fill: 'var(--sh-warning-solid)' },
  { key: 'failed', fill: 'var(--sh-danger-solid)' },
];

/** 14-day stacked volume bars — succeeded / pending / failed, one bar per day. */
export default function VolumeChart({ stats }: { stats: NotificationStatsWithDate[] }): ReactElement {
  const maxValue = Math.max(1, ...stats.map(s => s.total)) * 1.05;
  const slot = (W - PAD_L - PAD_R) / Math.max(1, stats.length);
  const barWidth = Math.min(38, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={240} preserveAspectRatio="none" className={styles.chart} role="img" aria-label="Daily notification volume by outcome">
      {stats.map((day, index) => {
        const x = PAD_L + index * slot + (slot - barWidth) / 2;
        let y = PAD_T + PLOT_H;
        return (
          <g key={day.date}>
            {SEGMENTS.map(seg => {
              const height = (day[seg.key] / maxValue) * PLOT_H;
              y -= height;
              return <rect key={seg.key} x={x} y={y} width={barWidth} height={height} fill={seg.fill} rx={1} />;
            })}
            {index % 2 === 0 ? (
              <text x={x + barWidth / 2} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--sh-text-tertiary)">
                {formatDay(day.date)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
