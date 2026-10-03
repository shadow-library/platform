import { Button, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type ContinuityProposalResponse, useApplyContinuityProposalMutation, useDiscardContinuityProposalMutation } from '@/lib/apis';
import { continuityHighlights } from '@/lib/continuity-proposal';
import { continuityCaption, continuityHasHeldEntries } from '@/lib/review-queue';

import styles from './Chat.module.css';

export interface ContinuityProposalCardProps {
  novelId: string;
  proposal: ContinuityProposalResponse;
}

/** What a written chapter adds to the Story Bible, decided where it was asked for: add it, or leave it out. */
export function ContinuityProposalCard({ novelId, proposal }: ContinuityProposalCardProps): React.JSX.Element {
  const apply = useApplyContinuityProposalMutation(novelId);
  const discard = useDiscardContinuityProposalMutation(novelId);
  const highlights = continuityHighlights(proposal.proposal);
  const held = continuityHasHeldEntries(proposal.proposal);
  const busy = apply.isPending || discard.isPending;

  const doApply = (): void =>
    apply.mutate(proposal.chapter, {
      onSuccess: result =>
        toast.success(
          result.status === 'pending' ? 'Added what it could — a few low-confidence items are still waiting on you' : `Chapter ${proposal.chapter} added to the Story Bible`,
        ),
      onError: error => toast.danger(error.message),
    });

  const doDiscard = (): void =>
    discard.mutate(proposal.chapter, {
      onSuccess: () => toast.success('Story Bible additions discarded'),
      onError: error => toast.danger(error.message),
    });

  return (
    <section className={styles.turnCard} aria-label={`Chapter ${proposal.chapter} Story Bible additions`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Chapter {proposal.chapter}: Story Bible additions</span>
        <StatusChip intent="warning" dot>
          ready for you
        </StatusChip>
        <span className={`${styles.caption} ${styles.pushEnd}`}>{continuityCaption(proposal.proposal)}</span>
      </div>
      <div className={styles.turnOps}>
        {highlights.map(highlight => (
          <div key={highlight.label} className={styles.turnOp}>
            <span className={styles.cardTitle}>
              {highlight.label} · {highlight.count}
            </span>
            {highlight.items.length > 0 && (
              <p className={styles.caption}>
                {highlight.items.join(', ')}
                {highlight.more > 0 && ` and ${highlight.more} more`}
              </p>
            )}
          </div>
        ))}
        {held && (
          <div className={styles.turnOp}>
            <div className={styles.turnOpNote}>Confident items are added now; items still marked low-confidence stay here for another look.</div>
          </div>
        )}
      </div>
      <div className={styles.cardActions}>
        <Button size="sm" variant="primary" loading={apply.isPending} disabled={busy} onClick={doApply}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" loading={discard.isPending} disabled={busy} onClick={doDiscard}>
          Discard
        </Button>
      </div>
    </section>
  );
}
