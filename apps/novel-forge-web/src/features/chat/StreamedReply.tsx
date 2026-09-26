import { LookupTrace } from '@/components/nf/LookupTrace';
import { Markdown } from '@/components/nf/Markdown';
import { type ChatTurnStreamState } from '@/lib/apis';

import styles from './Chat.module.css';

export interface StreamedReplyProps {
  stream: ChatTurnStreamState;
}

const BUBBLE_STATE: Partial<Record<ChatTurnStreamState['status'], string>> = { failed: styles.streamFailed, stopped: styles.streamStopped };

/** The reply as it arrives. Deliberately not a live region: the composer's status line announces the finished turn once, not every delta. */
export function StreamedReply({ stream }: StreamedReplyProps): React.JSX.Element {
  const state = BUBBLE_STATE[stream.status];
  return (
    <div className={styles.assistantCol} aria-busy={stream.status === 'streaming'}>
      <LookupTrace lookups={stream.lookups} running={stream.status === 'streaming'} />
      {stream.reply && <Markdown content={stream.reply} className={state ? `${styles.assistantBubble} ${state}` : styles.assistantBubble} />}
      {stream.status === 'stopped' && <div className={styles.caption}>Stopped</div>}
    </div>
  );
}
