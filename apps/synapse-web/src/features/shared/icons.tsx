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

export function BudgetIcon(): ReactElement {
  return <StrokeIcon paths={['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16 14.5h.01']} />;
}

export function FeaturesIcon(): ReactElement {
  return <StrokeIcon paths={['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z']} />;
}

export function ModelIcon(): ReactElement {
  return <StrokeIcon paths={['M7 7h10v10H7z', 'M9 3v4', 'M15 3v4', 'M9 17v4', 'M15 17v4', 'M3 9h4', 'M3 15h4', 'M17 9h4', 'M17 15h4']} />;
}

export function PublishIcon(): ReactElement {
  return <StrokeIcon paths={['M12 15V3', 'M7 8l5-5 5 5', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4']} />;
}

export function HistoryIcon(): ReactElement {
  return <StrokeIcon paths={['M3 12a9 9 0 1 0 3-6.7', 'M3 4v4h4', 'M12 7v5l3 2']} />;
}

export function ProviderIcon(): ReactElement {
  return <StrokeIcon paths={['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01', 'M8 17h.01']} />;
}

export function InfoIcon(): ReactElement {
  return <StrokeIcon paths={['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16v-4', 'M12 8h.01']} size={14} />;
}

export function EditIcon(): ReactElement {
  return <StrokeIcon paths={['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z']} size={16} />;
}

export function RemoveIcon(): ReactElement {
  return <StrokeIcon paths={['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6']} size={16} />;
}

export function ImpactIcon(): ReactElement {
  return <StrokeIcon paths={['M3 17l6-6 4 4 8-8', 'M14 7h7v7']} size={16} />;
}

export function TestIcon(): ReactElement {
  return <StrokeIcon paths={['M22 12h-4l-3 9L9 3l-3 9H2']} size={16} />;
}

export function RotateIcon(): ReactElement {
  return <StrokeIcon paths={['M21 12a9 9 0 0 1-15.5 6.2', 'M3 12a9 9 0 0 1 15.5-6.2', 'M21 4v5h-5', 'M3 20v-5h5']} size={16} />;
}

export function RevokeIcon(): ReactElement {
  return <StrokeIcon paths={['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M5.6 5.6l12.8 12.8']} size={16} />;
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
