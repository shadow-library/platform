/**
 * Importing npm packages
 */
import { type ReactElement } from 'react';

import styles from './icons.module.css';

/**
 * Inline SVG icon set for the Pulse shell — no icon-library dependency.
 */
function StrokeIcon({ paths, size = 18, strokeWidth = 1.8 }: { paths: string[]; size?: number; strokeWidth?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function DashboardIcon(): ReactElement {
  return <StrokeIcon paths={['M4 13h6V4H4z', 'M14 20h6V4h-6z', 'M4 20h6v-4H4z']} />;
}

export function TemplateIcon(): ReactElement {
  return <StrokeIcon paths={['M4 5h16v5H4z', 'M4 14h7v5H4z', 'M14 14h6v5h-6z']} />;
}

export function SenderIcon(): ReactElement {
  return <StrokeIcon paths={['M3 6h18v12H3z', 'M3 7l9 6 9-6']} />;
}

export function LayoutIcon(): ReactElement {
  return <StrokeIcon paths={['M4 5h16v14H4z', 'M4 10h16', 'M9 10v9']} />;
}

export function PartialIcon(): ReactElement {
  return <StrokeIcon paths={['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5', 'M12 12v9', 'M12 12L4 7.5']} />;
}

export function RoutingIcon(): ReactElement {
  return <StrokeIcon paths={['M6 3v6a4 4 0 0 0 4 4h8', 'M15 9l3-3-3-3', 'M18 21v-2']} />;
}

export function SendIcon(): ReactElement {
  return <StrokeIcon paths={['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z']} />;
}

export function LogIcon(): ReactElement {
  return <StrokeIcon paths={['M8 6h12', 'M8 12h12', 'M8 18h9', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01']} />;
}

export function SearchIcon(): ReactElement {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx={11} cy={11} r={7} />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

export function MoonIcon(): ReactElement {
  return <StrokeIcon paths={['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']} size={16} />;
}

export function SunIcon(): ReactElement {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={12} cy={12} r={4} />
      {['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41'].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** The pulse waveform glyph in an accent square — reused as the workspace mark and preview avatar. */
export function PulseSquare({ size = 26, radius = 7 }: { size?: number; radius?: number }): ReactElement {
  return (
    <div className={styles.mark} style={{ width: size, height: size, borderRadius: radius }}>
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--sh-on-accent)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12h4l2 6 4-14 2 8h6" />
      </svg>
    </div>
  );
}

/** Full workspace identity shown in the sidebar header. */
export function PulseMark(): ReactElement {
  return (
    <div className={styles.workspace}>
      <PulseSquare />
      <div className={styles.workspaceText}>
        <span className={styles.workspaceName}>Pulse</span>
        <span className={styles.workspaceSub}>Notification Ops</span>
      </div>
    </div>
  );
}
