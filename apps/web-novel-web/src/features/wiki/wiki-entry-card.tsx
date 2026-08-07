import { Link } from '@tanstack/react-router';
import { Badge, cn } from '@shadow-library/ui';

import { type WikiEntrySummary, type WikiEntryType } from '@/lib/apis/types';

import styles from './wiki.module.css';

export interface WikiEntryCardProps {
  slug: string;
  entry: WikiEntrySummary;
  className?: string;
}

export const WIKI_TYPE_LABEL: Record<WikiEntryType, string> = {
  character: 'Character',
  faction: 'Faction',
  location: 'Location',
  item: 'Item',
  concept: 'Concept',
  power_rule: 'Power Rule',
};

const WIKI_TYPE_INTENT: Record<WikiEntryType, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  character: 'info',
  faction: 'danger',
  location: 'success',
  item: 'warning',
  concept: 'neutral',
  power_rule: 'info',
};

const PORTRAIT_PALETTE: [string, string][] = [
  ['#6366f1', '#312e81'],
  ['#0ea5e9', '#0c4a6e'],
  ['#f43f5e', '#4c0519'],
  ['#a855f7', '#3b0764'],
  ['#10b981', '#064e3b'],
  ['#14b8a6', '#134e4a'],
  ['#f59e0b', '#451a03'],
  ['#8b5cf6', '#2e1065'],
];

function portraitGradient(name: string): [string, string] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PORTRAIT_PALETTE[hash % PORTRAIT_PALETTE.length] as [string, string];
}

export function WikiTypeBadge({ type, size = 'sm' }: { type: WikiEntryType; size?: 'sm' | 'md' }): React.JSX.Element {
  return (
    <Badge intent={WIKI_TYPE_INTENT[type]} size={size}>
      {WIKI_TYPE_LABEL[type]}
    </Badge>
  );
}

export function WikiPortrait({ name, imageUrl, className }: { name: string; imageUrl?: string; className?: string }): React.JSX.Element {
  if (imageUrl) return <img src={imageUrl} alt={name} className={cn(styles.portrait, styles.portraitImg, className)} />;
  const [from, to] = portraitGradient(name);
  return (
    <div className={cn(styles.portrait, className)} style={{ background: `linear-gradient(158deg, ${from} 0%, ${to} 100%)` }} aria-hidden="true">
      <span className={styles.portraitGlyph}>{name.charAt(0)}</span>
    </div>
  );
}

export function WikiEntryCard({ slug, entry, className }: WikiEntryCardProps): React.JSX.Element {
  return (
    <Link to="/novels/$slug/wiki/$entryKey" params={{ slug, entryKey: entry.entryKey }} className={cn(styles.entryCard, className)}>
      <WikiPortrait name={entry.name} imageUrl={entry.imageUrl} />
      <div className={styles.entryName}>{entry.name}</div>
      <div className={styles.entryBadgeRow}>
        <WikiTypeBadge type={entry.type} />
      </div>
    </Link>
  );
}
