import { Badge, cn } from '@shadow-library/ui';

import { StarIcon } from '@/components/icons';
import { type NovelCover, type NovelStatus } from '@/lib/apis/types';

import styles from './novel.module.css';

export interface CoverProps {
  cover: NovelCover;
  title: string;
  showTitle?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Cover artwork: the real image when `cover.imageUrl` was resolved server-side, else the deterministic
 * gradient + title glyph placeholder — the same device-independent trick the design prototype uses, so a
 * cover-less novel still renders offline and with zero requests.
 */
export function Cover({ cover, title, showTitle = true, className, children }: CoverProps): React.JSX.Element {
  return (
    <div className={cn(styles.cover, className)} style={cover.imageUrl ? undefined : { background: `linear-gradient(158deg, ${cover.from} 0%, ${cover.to} 100%)` }}>
      {cover.imageUrl ? (
        <img src={cover.imageUrl} alt={title} className={styles.coverImg} />
      ) : (
        <span className={styles.coverGlyph} aria-hidden="true">
          {title.charAt(0)}
        </span>
      )}
      {showTitle && <span className={styles.coverTitle}>{title}</span>}
      {children}
    </div>
  );
}

export function RatingRow({ rating, suffix }: { rating: number; suffix?: string }): React.JSX.Element {
  return (
    <span className={styles.ratingRow}>
      <span className={styles.rating}>
        <StarIcon size={12} />
        {rating.toFixed(1)}
      </span>
      {suffix && <span className={styles.ratingSub}>· {suffix}</span>}
    </span>
  );
}

const STATUS_INTENT: Record<NovelStatus, 'success' | 'info' | 'warning'> = { ongoing: 'success', completed: 'info', hiatus: 'warning' };
const STATUS_LABEL: Record<NovelStatus, string> = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus' };

export function StatusBadge({ status }: { status: NovelStatus }): React.JSX.Element {
  return (
    <Badge intent={STATUS_INTENT[status]} size="sm" dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}
