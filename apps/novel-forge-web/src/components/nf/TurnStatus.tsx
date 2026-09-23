import { Button } from '@shadow-library/ui';

import { SparkIcon } from '@/components/icons';
import { type FailedTurnResponse, type TurnState } from '@/lib/apis';
import { formatElapsed } from '@/lib/format';
import { useElapsed } from '@/lib/use-elapsed';

import styles from './TurnStatus.module.css';

interface Phase {
  label: string;
  slowLabel: string;
}

interface FailureCopy {
  title: string;
  reason: string;
}

// The graph is the only phase the server reports without streaming, so it names the wait — the reply then
// lands in the space the placeholder already holds.
const PHASES: Record<string, Phase> = {
  'chat-turn': { label: 'Reading the chapter and your ask', slowLabel: 'Still reading the chapter and your ask' },
};

// The server's error messages are written for the model call log. A code missing here gets the generic copy,
// so a new server code reads as vague rather than wrong.
const FAILURE_COPY: Record<string, FailureCopy> = {
  AI_001: { title: 'The model’s answer came back unreadable', reason: 'It replied, but not in a shape that could be used.' },
  AI_002: { title: 'This model can’t be used here', reason: 'Pick a different model for this conversation, then try again.' },
  AI_003: { title: 'This model isn’t allowed for this project', reason: 'Unrestricted projects can only use models on their allowlist.' },
  AI_006: { title: 'AI isn’t set up on this server', reason: 'An API key has to be configured on the server first.' },
  AI_007: { title: 'Couldn’t reach the model', reason: 'It didn’t respond after a few tries.' },
  AI_008: { title: 'Too many model calls right now', reason: 'Wait a moment, then try again.' },
  AI_009: { title: 'AI spending limit reached', reason: 'Model calls are paused for this account until the limit resets.' },
};

const UNKNOWN_FAILURE: FailureCopy = { title: 'That turn didn’t finish', reason: 'Something went wrong on the server.' };

// Past this the wait is worth naming: the median turn lands well inside it, so the copy switching is
// itself the signal that this one is unusual.
const SLOW_AFTER_MS = 45_000;
// Elapsed time before this reads as a stopwatch on a request that was always going to be quick.
const SHOW_ELAPSED_AFTER_MS = 5_000;

interface TurnStatusProps {
  state: TurnState;
  /** A turn this tab has in flight, which covers the beat between sending and the first poll. */
  sending: boolean;
  /** Phase copy for a turn whose graph is not known yet. */
  fallbackLabel: string;
  onRetry: (content: string) => void;
}

export function TurnStatus({ state, sending, fallbackLabel, onRetry }: TurnStatusProps): React.JSX.Element | null {
  const running = state.kind === 'pending' ? state.pending : null;
  const elapsed = useElapsed(running?.startedAt);

  if (running) return <GhostReply phase={PHASES[running.graph]} fallbackLabel={fallbackLabel} elapsed={elapsed} />;
  // A failure the server has recorded outranks this tab's own in-flight send: the call is over, whatever the request is still doing.
  if (state.kind === 'failed') return <FailedTurn failed={state.failed} onRetry={() => onRetry(state.retryContent)} />;
  if (sending || state.kind === 'pending') return <GhostReply fallbackLabel={fallbackLabel} elapsed={0} />;
  return null;
}

interface GhostReplyProps {
  phase?: Phase;
  fallbackLabel: string;
  elapsed: number;
}

function GhostReply({ phase, fallbackLabel, elapsed }: GhostReplyProps): React.JSX.Element {
  const slow = elapsed >= SLOW_AFTER_MS;
  const label = phase ? (slow ? phase.slowLabel : phase.label) : fallbackLabel;

  return (
    <div className={styles.row} data-pace={slow ? 'slow' : 'steady'}>
      <div className={styles.avatar}>
        <SparkIcon size={15} rayClassName={styles.ray} />
      </div>
      <div className={styles.col}>
        <div className={styles.bubble}>
          <div className={styles.caption}>
            <span className={styles.phase} role="status">
              {label}…
            </span>
            {elapsed >= SHOW_ELAPSED_AFTER_MS && (
              <span className={styles.elapsed} aria-hidden="true">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>
          <LinesGhost count={4} />
          {slow && <p className={styles.note}>This one’s taking longer than usual. The model is still answering.</p>}
        </div>
      </div>
    </div>
  );
}

function LinesGhost({ count }: { count: number }): React.JSX.Element {
  return (
    <div className={styles.lines} aria-hidden="true">
      {Array.from({ length: count }, (_, line) => (
        <span key={line} className={styles.line} />
      ))}
    </div>
  );
}

interface FailedTurnProps {
  /** Absent when the transcript was stranded without a run the server could report on. */
  failed: FailedTurnResponse | null;
  onRetry: () => void;
}

function FailedTurn({ failed, onRetry }: FailedTurnProps): React.JSX.Element {
  const copy = (failed?.code && FAILURE_COPY[failed.code]) || UNKNOWN_FAILURE;

  return (
    <div className={styles.row} data-state="failed">
      <div className={styles.avatar}>
        <SparkIcon size={15} />
      </div>
      <div className={styles.col}>
        <div className={styles.bubble} role="status">
          <span className={styles.failureTitle}>{copy.title}</span>
          <p className={styles.failureReason}>{copy.reason} Your message is saved and nothing was changed.</p>
          <div className={styles.failureActions}>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
            {failed?.code && <span className={styles.code}>{failed.code}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
