import { Avatar, Button, cn, toast } from '@shadow-library/ui';
import { useMemo, useState } from 'react';

import { EyeOffIcon, StarIcon, ThumbsUpIcon } from '@/components/icons';
import { type NovelDetail, type NovelReview } from '@/lib/apis/types';

import { reportToast } from './report-toast';
import styles from './novel-screen.module.css';
import { Stars } from './stars';

type ReviewSort = 'helpful' | 'rating' | 'recent';

const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'helpful', label: 'Most helpful' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'recent', label: 'Newest' },
];

export function ReviewsPanel({ novel }: { novel: NovelDetail }): React.JSX.Element {
  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState<Set<string>>(new Set());
  // Memoized: the ?? [] fallback would otherwise mint a new array each render and defeat the sorted useMemo.
  const reviews = useMemo(() => novel.reviews ?? [], [novel.reviews]);

  const sorted = useMemo(() => {
    const list = [...reviews];
    if (sort === 'helpful') return list.sort((a, b) => b.helpful - a.helpful);
    if (sort === 'rating') return list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [reviews, sort]);

  const distribution = novel.ratingDistribution ?? [0, 0, 0, 0, 0];
  const distTotal = distribution.reduce((accumulator, value) => accumulator + value, 0) || 1;

  const reveal = (id: string): void => setRevealed(prev => new Set(prev).add(id));
  const vote = (id: string): void => setVoted(prev => new Set(prev).add(id));

  return (
    <div>
      <div className={styles.reviewSummary}>
        <div className={styles.reviewScore}>
          <div className={styles.reviewBig}>{novel.rating.toFixed(1)}</div>
          <Stars value={novel.rating} size={17} />
          <div className={styles.reviewCount}>{novel.ratingCount.toLocaleString()} reviews</div>
        </div>
        <div className={styles.distList}>
          {distribution.map((count, index) => {
            const pct = Math.round((count / distTotal) * 100);
            return (
              <div key={index} className={styles.distRow}>
                <span className={styles.distStar}>{5 - index}</span>
                <StarIcon size={11} className={styles.distStarIcon} />
                <span className={styles.distTrack}>
                  <span className={styles.distFill} style={{ width: `${pct}%` }} />
                </span>
                <span className={styles.distPct}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.reviewToolbar}>
        <div className={styles.chipRow}>
          {REVIEW_SORTS.map(option => (
            <button key={option.value} type="button" className={cn(styles.chip, sort === option.value && styles.chipActive)} onClick={() => setSort(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={() => toast.info('Thanks! Review posting is coming soon.')}>
          Write a review
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No reviews yet</div>
          <div>Be the first to share your thoughts on this novel.</div>
        </div>
      ) : (
        sorted.map(review => <ReviewCard key={review.id} review={review} revealed={revealed.has(review.id)} voted={voted.has(review.id)} onReveal={reveal} onVote={vote} />)
      )}
    </div>
  );
}

interface ReviewCardProps {
  review: NovelReview;
  revealed: boolean;
  voted: boolean;
  onReveal: (id: string) => void;
  onVote: (id: string) => void;
}

function ReviewCard({ review, revealed, voted, onReveal, onVote }: ReviewCardProps): React.JSX.Element {
  const showBody = !review.spoiler || revealed;
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <Avatar name={review.user} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.cardUser}>{review.user}</div>
          <div className={styles.cardWhen}>{review.when}</div>
        </div>
        <Stars value={review.rating} size={14} />
      </div>
      {showBody ? (
        <p className={styles.cardBody}>{review.body}</p>
      ) : (
        <button type="button" className={styles.spoilerButton} onClick={() => onReveal(review.id)}>
          <EyeOffIcon size={15} /> Spoiler — tap to reveal
        </button>
      )}
      <div className={styles.cardActions}>
        <button type="button" className={cn(styles.cardAction, voted && styles.cardActionOn)} onClick={() => onVote(review.id)}>
          <ThumbsUpIcon size={15} /> Helpful · {(review.helpful + (voted ? 1 : 0)).toLocaleString()}
        </button>
        <button type="button" className={styles.cardAction} onClick={() => reportToast('this review')}>
          Report
        </button>
      </div>
    </div>
  );
}
