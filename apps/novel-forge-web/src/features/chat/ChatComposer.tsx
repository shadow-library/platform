import { type ReactNode, type Ref } from 'react';
import { Button, IconButton, Textarea } from '@shadow-library/ui';

import { ArrowUpIcon, StopIcon } from '@/components/icons';
import { ProseEditsToggle } from '@/components/nf/ProseEditsToggle';

import { type QueuedView } from './chat-queue';
import { type PromptChip } from './chat-view';
import styles from './Chat.module.css';

export interface ChatComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  inputRef?: Ref<HTMLTextAreaElement>;
  composerRef?: Ref<HTMLDivElement>;
  onSend: () => void;
  /** Present while a turn this composer can stop is running. */
  onStop?: () => void;
  stopping: boolean;
  /** A first message is being handed to a new chat. */
  sending: boolean;
  /** A turn is running: Enter queues the message and the action button stops the turn. */
  running: boolean;
  locked: boolean;
  /** The chat's mode is being saved; a message sent now could still run under the old one. */
  switching: boolean;
  chips: PromptChip[];
  onChip: (chip: PromptChip) => void;
  modeMenu: ReactNode;
  modelMenu: ReactNode;
  justDiscussing: boolean;
  proseEdits: boolean;
  onProseEditsChange: (value: boolean) => void;
  queued?: QueuedView;
  onEditQueued: () => void;
  onSendQueued: () => void;
  /** Why Enter did nothing, shown while the box holds text. */
  caption?: string;
  /** Warnings the author should see before sending, such as a half-answered card. */
  notices?: ReactNode;
  /** A finished turn or job, read once by assistive tech. */
  announcement: string;
}

function placeholderOf(running: boolean, queued: boolean, justDiscussing: boolean): string {
  if (running) return queued ? 'One message is queued. Edit it or wait for this reply.' : 'Type to queue a message. It sends when this reply finishes.';
  if (justDiscussing) return 'Think out loud — what if…';
  return 'Tell the chat what you want, or ask it anything…';
}

export function ChatComposer({
  input,
  onInputChange,
  inputRef,
  composerRef,
  onSend,
  onStop,
  stopping,
  sending,
  running,
  locked,
  switching,
  chips,
  onChip,
  modeMenu,
  modelMenu,
  justDiscussing,
  proseEdits,
  onProseEditsChange,
  queued,
  onEditQueued,
  onSendQueued,
  caption,
  notices,
  announcement,
}: ChatComposerProps): React.JSX.Element {
  return (
    <div className={styles.composer}>
      <div ref={composerRef} className={styles.composerStack}>
        {queued && (
          <div className={styles.queued}>
            <span className={styles.queuedLabel}>Queued</span>
            <span className={styles.queuedText} title={queued.text}>
              {queued.text}
            </span>
            <Button size="sm" variant="ghost" disabled={locked} onClick={onEditQueued}>
              Edit
            </Button>
            {queued.held && (
              <Button size="sm" variant="secondary" disabled={locked || switching} onClick={onSendQueued}>
                Send now
              </Button>
            )}
            {queued.note && <span className={styles.queuedNote}>{queued.note}</span>}
          </div>
        )}
        {notices}
        <div className={styles.composerInner} data-discussing={justDiscussing || undefined}>
          <Textarea
            ref={inputRef}
            aria-label="Message"
            variant="bare"
            size="lg"
            value={input}
            onValueChange={onInputChange}
            placeholder={placeholderOf(running, Boolean(queued), justDiscussing)}
            minRows={1}
            maxRows={6}
            autoGrow
            disabled={locked}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              onSend();
            }}
          />
          <div className={styles.composerBar}>
            {modeMenu}
            {modelMenu}
            <ProseEditsToggle checked={proseEdits} onCheckedChange={onProseEditsChange} message={input} disabled={locked} className={styles.proseToggle} />
            {running ? (
              <IconButton
                variant="primary"
                className={`${styles.round} ${styles.stop}`}
                aria-label="Stop"
                icon={<StopIcon size={16} />}
                loading={stopping}
                disabled={!onStop || stopping}
                onClick={onStop}
              />
            ) : (
              <IconButton
                variant="primary"
                className={styles.round}
                aria-label="Send"
                icon={<ArrowUpIcon size={16} />}
                loading={sending}
                disabled={locked || sending || switching || input.trim().length === 0}
                onClick={onSend}
              />
            )}
          </div>
        </div>
        {!queued && chips.length > 0 && (
          <div className={styles.chips} role="group" aria-label="Suggested prompts">
            {chips.map(chip => (
              <Button key={chip.label} size="sm" variant="secondary" className={styles.chip} disabled={locked} onClick={() => onChip(chip)}>
                {chip.label}
              </Button>
            ))}
          </div>
        )}
        {caption && (
          <div className={styles.caption} role="status">
            {caption}
          </div>
        )}
        <div className={styles.srOnly} role="status" aria-live="polite">
          {announcement}
        </div>
      </div>
    </div>
  );
}
