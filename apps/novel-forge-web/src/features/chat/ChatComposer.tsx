import { type ReactNode, type Ref } from 'react';
import { Button, Textarea } from '@shadow-library/ui';

import { SendIcon, StopIcon } from '@/components/icons';
import { ProseEditsToggle } from '@/components/nf/ProseEditsToggle';

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
  sending: boolean;
  locked: boolean;
  chips: PromptChip[];
  onChip: (chip: PromptChip) => void;
  modelMenu: ReactNode;
  justDiscussing: boolean;
  onJustDiscussingChange: (value: boolean) => void;
  proseEdits: boolean;
  onProseEditsChange: (value: boolean) => void;
  /** What the composer's controls will do with the next message, for the current mode. */
  hint: string;
  /** Warnings the author should see before sending, such as a half-answered card or a manual chat. */
  notices?: ReactNode;
  /** A finished turn or job, read once by assistive tech. */
  announcement: string;
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
  locked,
  chips,
  onChip,
  modelMenu,
  justDiscussing,
  onJustDiscussingChange,
  proseEdits,
  onProseEditsChange,
  hint,
  notices,
  announcement,
}: ChatComposerProps): React.JSX.Element {
  return (
    <div className={styles.composer}>
      <div ref={composerRef} className={styles.composerStack}>
        {chips.length > 0 && (
          <div className={styles.chips} role="group" aria-label="Suggested prompts">
            {chips.map(chip => (
              <Button key={chip.label} size="sm" variant="secondary" className={styles.chip} disabled={locked} onClick={() => onChip(chip)}>
                {chip.label}
              </Button>
            ))}
          </div>
        )}
        {notices}
        <div className={styles.composerInner} data-discussing={justDiscussing || undefined}>
          <Textarea
            ref={inputRef}
            aria-label="Message"
            value={input}
            onValueChange={onInputChange}
            placeholder={justDiscussing ? 'Think out loud — what if…' : 'Tell the chat what you want, or ask it anything…'}
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
            {modelMenu}
            <button type="button" className={styles.discussToggle} aria-pressed={justDiscussing} disabled={locked} onClick={() => onJustDiscussingChange(!justDiscussing)}>
              <span className={styles.discussDot} aria-hidden="true" />
              Just discussing
            </button>
            <ProseEditsToggle checked={proseEdits} onCheckedChange={onProseEditsChange} message={input} disabled={locked} />
            <span className={styles.hint} title={hint}>
              {hint}
            </span>
            {onStop ? (
              <Button variant="danger" size="sm" className={styles.pushEnd} prefix={<StopIcon size={14} />} loading={stopping} disabled={stopping} onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className={styles.pushEnd}
                prefix={<SendIcon size={14} />}
                loading={sending}
                disabled={locked || sending || input.trim().length === 0}
                onClick={onSend}
              >
                Send
              </Button>
            )}
          </div>
        </div>
        <div className={styles.srOnly} role="status" aria-live="polite">
          {announcement}
        </div>
      </div>
    </div>
  );
}
