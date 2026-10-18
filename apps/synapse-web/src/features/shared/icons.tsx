import { type ReactElement } from 'react';

import styles from './icons.module.css';

function StrokeIcon({ paths, size = 18, strokeWidth = 1.8 }: { paths: string[]; size?: number; strokeWidth?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function OverviewIcon(): ReactElement {
  return <StrokeIcon paths={['M4 13h6V4H4z', 'M14 20h6V4h-6z', 'M4 20h6v-4H4z']} />;
}

export function CatalogIcon(): ReactElement {
  return <StrokeIcon paths={['M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3', 'M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3', 'M9 9l-2 3 2 3', 'M15 9l2 3-2 3']} />;
}

export function AliasIcon(): ReactElement {
  return <StrokeIcon paths={['M7 7h10', 'M7 17h4', 'M14 14l3 3-3 3', 'M3 7h.01', 'M3 17h.01']} />;
}

export function UsageIcon(): ReactElement {
  return <StrokeIcon paths={['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2']} />;
}

export function KeyIcon(): ReactElement {
  return <StrokeIcon paths={['M21 2l-2 2', 'M15.5 7.5l3 3L22 7l-3-3', 'M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z', 'M15.5 7.5l-4.1 4.1']} />;
}

export function MoonIcon(): ReactElement {
  return <StrokeIcon paths={['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']} size={16} />;
}

export function SunIcon(): ReactElement {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={12} cy={12} r={4} />
      {['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41'].map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function SynapseMark({ size = 26, radius = 7 }: { size?: number; radius?: number }): ReactElement {
  return (
    <div className={styles.mark} style={{ width: size, height: size, borderRadius: radius }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="var(--sh-on-accent)" stroke="var(--sh-on-accent)" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d="M6 7l6 5 6-5M6 17l6-5 6 5" fill="none" />
        <circle cx={6} cy={7} r={2} />
        <circle cx={18} cy={7} r={2} />
        <circle cx={12} cy={12} r={2.4} />
        <circle cx={6} cy={17} r={2} />
        <circle cx={18} cy={17} r={2} />
      </svg>
    </div>
  );
}
