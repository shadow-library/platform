import { Link } from '@tanstack/react-router';
import { Button, Tooltip } from '@shadow-library/ui';

import { Markdown, StatusChip } from '@/components/nf';
import { useDraftApproval } from '@/features/chapter-workspace';
import { type DraftResponse } from '@/lib/apis';
import { chapterTitle, wordCount } from '@/lib/chapter-editor';
import { type ChapterOpenMode } from '@/lib/chapter-panel';

import styles from './Chat.module.css';

export interface ChapterDraftCardProps {
  novelId: string;
  draft: DraftResponse;
  /** The panel beside the chat holds this chapter, so the card shrinks to a pointer there. */
  beside: boolean;
  onOpen: (chapter: number, mode: ChapterOpenMode) => void;
  onAskForChanges: (chapter: number) => void;
}

/** A written chapter waiting on the author, decided where it was asked for: read or edit it beside the chat, approve it, or ask the chat to revise it. */
export function ChapterDraftCard({ novelId, draft, beside, onOpen, onAskForChanges }: ChapterDraftCardProps): React.JSX.Element {
  const approval = useDraftApproval(novelId, draft);
  const contradiction = draft.reviewStatus === 'contradiction';
  const body = draft.body ?? '';
  const title = `Chapter ${draft.chapter}: ${chapterTitle(draft)}`;

  if (beside) {
    return (
      <section className={styles.turnCard} aria-label={`Chapter ${draft.chapter} draft`}>
        <div className={styles.draftPointer}>
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.caption}>· open beside the chat</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.turnCard} aria-label={`Chapter ${draft.chapter} draft`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{title}</span>
        <StatusChip intent={contradiction ? 'danger' : 'warning'} dot>
          {contradiction ? 'conflicts with canon' : 'ready for you'}
        </StatusChip>
        <span className={`${styles.caption} ${styles.pushEnd}`}>{wordCount(body).toLocaleString()} words</span>
      </div>
      <div className={styles.draftBody}>
        <Markdown content={body} />
      </div>
      <div className={styles.draftFoot}>
        {draft.judgeNote && <p className={styles.caption}>{draft.judgeNote}</p>}
        <div className={styles.row}>
          <Button size="sm" variant="ghost" data-open-chapter={draft.chapter} onClick={() => onOpen(draft.chapter, 'read')}>
            Open beside the chat
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpen(draft.chapter, 'edit')}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/novels/$novelId/chapters" params={{ novelId }} search={{ chapter: draft.chapter }}>
              Open in Chapters
            </Link>
          </Button>
          <Button size="sm" variant="secondary" className={styles.pushEnd} onClick={() => onAskForChanges(draft.chapter)}>
            Ask for changes
          </Button>
          <Tooltip content={approval.refusal ?? (approval.held > 0 ? 'Approve and record its blocking findings as overridden' : 'Approve this draft')}>
            <Button size="sm" variant="primary" disabled={Boolean(approval.refusal)} loading={approval.pending} onClick={() => approval.approve()}>
              Approve
            </Button>
          </Tooltip>
        </div>
      </div>
      {approval.dialog}
    </section>
  );
}
