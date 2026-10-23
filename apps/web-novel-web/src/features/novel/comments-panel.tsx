import { Avatar, Button, cn, Textarea, toast } from '@shadow-library/ui';
import { useMemo, useState } from 'react';

import { EyeOffIcon, LockIcon, ShieldIcon, ThumbsUpIcon, TrashIcon } from '@/components/icons';
import { type NovelComment, type NovelCommentReply, type NovelDetail } from '@/lib/apis/types';

import { reportToast } from './report-toast';
import styles from './novel-screen.module.css';

type CommentSort = 'recent' | 'top';

const COMMENT_SORTS: { value: CommentSort; label: string }[] = [
  { value: 'recent', label: 'Newest' },
  { value: 'top', label: 'Top' },
];

export function CommentsPanel({ novel, signedIn, accountName }: { novel: NovelDetail; signedIn: boolean; accountName: string }): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [sort, setSort] = useState<CommentSort>('recent');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  // Memoized: the ?? [] fallback would otherwise mint a new array each render and defeat the sorted useMemo.
  const comments = useMemo(() => novel.comments ?? [], [novel.comments]);

  const sorted = useMemo(() => {
    if (sort === 'top') return [...comments].sort((a, b) => b.likes - a.likes);
    return comments;
  }, [comments, sort]);

  const reveal = (id: string): void => setRevealed(prev => new Set(prev).add(id));
  const like = (id: string): void => setLiked(prev => new Set(prev).add(id));

  const onPost = (): void => {
    if (!signedIn) {
      toast.warning('Sign in to join the conversation');
      return;
    }
    if (!draft.trim()) {
      toast.warning('Write something first');
      return;
    }
    toast.success('Comment posted');
    setDraft('');
  };

  return (
    <div>
      <div className={styles.composer}>
        <Avatar name={accountName} size="sm" />
        <div style={{ flex: 1 }}>
          <Textarea value={draft} onValueChange={setDraft} placeholder="Share your thoughts on this novel…" minRows={2} aria-label="Write a comment" />
        </div>
      </div>
      <div className={styles.composerFoot}>
        {!signedIn && (
          <span className={styles.signInHint}>
            <LockIcon size={13} /> Sign in to post — reading comments is always open
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Button variant="primary" size="sm" onClick={onPost}>
          Post comment
        </Button>
      </div>

      <div className={styles.commentsHead}>
        <span className={styles.commentsTitle}>Comments</span>
        <span style={{ flex: 1 }} />
        <div className={styles.chipRow}>
          {COMMENT_SORTS.map(option => (
            <button key={option.value} type="button" className={cn(styles.chip, sort === option.value && styles.chipActive)} onClick={() => setSort(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No comments yet</div>
          <div>Start the discussion — be the first to comment.</div>
        </div>
      ) : (
        sorted.map(comment => <CommentCard key={comment.id} comment={comment} revealed={revealed} liked={liked} onReveal={reveal} onLike={like} />)
      )}
    </div>
  );
}

interface CommentCardProps {
  comment: NovelComment;
  revealed: Set<string>;
  liked: Set<string>;
  onReveal: (id: string) => void;
  onLike: (id: string) => void;
}

function CommentCard({ comment, revealed, liked, onReveal, onLike }: CommentCardProps): React.JSX.Element {
  if (comment.state === 'deleted') {
    return (
      <div className={styles.commentRow}>
        <div className={styles.commentRemoved}>
          <TrashIcon size={15} /> This comment was deleted by its author.
        </div>
      </div>
    );
  }
  if (comment.state === 'moderated') {
    return (
      <div className={styles.commentRow}>
        <div className={styles.commentRemoved}>
          <ShieldIcon size={15} /> Removed by a moderator for violating community guidelines.
        </div>
      </div>
    );
  }

  const showBody = !comment.spoiler || revealed.has(comment.id);
  const isLiked = liked.has(comment.id);
  return (
    <div className={styles.commentRow}>
      <div className={styles.commentMain}>
        <Avatar name={comment.user} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.commentMeta}>
            <span className={styles.cardUser}>{comment.user}</span>
            <span className={styles.cardWhen}>{comment.when}</span>
          </div>
          {showBody ? (
            <p className={styles.commentBody}>{comment.body}</p>
          ) : (
            <button type="button" className={cn(styles.spoilerButton, styles.spoilerInline)} onClick={() => onReveal(comment.id)}>
              <EyeOffIcon size={14} /> Spoiler — tap to reveal
            </button>
          )}
          <div className={styles.cardActions}>
            <button type="button" className={cn(styles.cardAction, isLiked && styles.cardActionOn)} onClick={() => onLike(comment.id)}>
              <ThumbsUpIcon size={14} /> {(comment.likes + (isLiked ? 1 : 0)).toLocaleString()}
            </button>
            <button type="button" className={styles.cardAction} onClick={() => toast.info('Replies open in the full thread.')}>
              Reply
            </button>
            <button type="button" className={styles.cardAction} onClick={() => reportToast('this comment')}>
              Report
            </button>
          </div>
          {comment.replies && comment.replies.length > 0 && (
            <div className={styles.replyList}>
              {comment.replies.map(reply => (
                <ReplyCard key={reply.id} reply={reply} revealed={revealed.has(reply.id)} onReveal={onReveal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplyCard({ reply, revealed, onReveal }: { reply: NovelCommentReply; revealed: boolean; onReveal: (id: string) => void }): React.JSX.Element {
  const showBody = !reply.spoiler || revealed;
  return (
    <div className={styles.replyRow}>
      <Avatar name={reply.user} size="xs" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.commentMeta}>
          <span className={styles.replyUser}>{reply.user}</span>
          <span className={styles.cardWhen}>{reply.when}</span>
        </div>
        {showBody ? (
          <p className={styles.replyBody}>{reply.body}</p>
        ) : (
          <button type="button" className={cn(styles.spoilerButton, styles.spoilerInline)} onClick={() => onReveal(reply.id)}>
            <EyeOffIcon size={13} /> Spoiler — reveal
          </button>
        )}
      </div>
    </div>
  );
}
