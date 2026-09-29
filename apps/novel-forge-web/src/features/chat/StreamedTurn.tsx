import { Markdown } from '@/components/nf/Markdown';
import { type ChatTurnStreamState } from '@/lib/apis';
import { type TurnMode, turnTimeline } from '@/lib/chat-turn-timeline';
import { useNow } from '@/lib/use-elapsed';

import styles from './Chat.module.css';
import { TurnLiveTail, TurnTrace } from './TurnTimeline';

export interface StreamedTurnProps {
  stream: ChatTurnStreamState;
  mode: TurnMode;
  now: number;
  /** What the turn changed, once it has settled; rendered where the saving row was. */
  receipt?: React.ReactNode;
  /** Replaces the plain "Worked …" line, for a caller that folds it into the reply's model line. */
  footer?: React.ReactNode;
}

/**
 * The assistant turn as a timeline, oldest first and the live tail last. Deliberately not a live region: the composer's status line
 * announces the finished turn once, not every delta.
 */
export function StreamedTurn({ stream, mode, now, receipt, footer }: StreamedTurnProps): React.JSX.Element {
  const view = turnTimeline(stream, now, mode);
  return (
    <div className={styles.assistantCol} aria-busy={view.live}>
      <TurnTrace rows={view.trace} />
      {stream.reply && <Markdown content={stream.reply} className={stream.status === 'stopped' ? `${styles.assistantReply} ${styles.replyStopped}` : styles.assistantReply} />}
      <TurnTrace rows={view.saving ? [view.saving] : []} />
      {receipt}
      {view.tail && <TurnLiveTail tail={view.tail} />}
      {footer ?? (view.worked && <div className={styles.caption}>{view.worked}</div>)}
    </div>
  );
}

export type LiveStreamedTurnProps = Omit<StreamedTurnProps, 'now'>;

export function LiveStreamedTurn(props: LiveStreamedTurnProps): React.JSX.Element {
  const now = useNow(props.stream.status === 'idle' || props.stream.status === 'streaming');
  return <StreamedTurn {...props} now={now} />;
}
