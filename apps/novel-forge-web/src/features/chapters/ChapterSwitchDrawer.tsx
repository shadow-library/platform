import { Drawer } from '@shadow-library/ui';

import { useDraftSummaryQuery } from '@/lib/apis';

import { statusMeta } from './chapter-status';
import styles from './chapters.module.css';

interface ChapterSwitchDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  novelId: string;
  current: number;
  onPick: (n: number) => void;
}

export function ChapterSwitchDrawer({ open, onOpenChange, novelId, current, onPick }: ChapterSwitchDrawerProps): React.JSX.Element {
  const draftsQuery = useDraftSummaryQuery(novelId, open);
  const drafts = [...(draftsQuery.data?.items ?? [])].sort((a, b) => a.chapter - b.chapter);
  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="left" size="sm">
      <Drawer.Header title="Chapters" />
      <Drawer.Body>
        {drafts.map(d => {
          const meta = statusMeta(d);
          const active = d.chapter === current;
          return (
            <button
              key={d.chapter}
              className="nf-selrow"
              data-active={active || undefined}
              onClick={() => {
                onPick(d.chapter);
                onOpenChange(false);
              }}
            >
              <span className={styles.switchNum}>{String(d.chapter).padStart(2, '0')}</span>
              <span className={styles.switchTitle}>{d.title ?? 'Untitled'}</span>
              {(d.reviewStatus === 'needs_review' || d.reviewStatus === 'contradiction') && (
                <span className={styles.switchDot} style={{ '--nf-dot': meta.intent === 'danger' ? 'var(--sh-danger-solid)' : 'var(--sh-warning-solid)' } as React.CSSProperties} />
              )}
            </button>
          );
        })}
      </Drawer.Body>
    </Drawer>
  );
}
