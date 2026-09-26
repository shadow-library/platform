import { useState } from 'react';
import { SegmentedControl, Select } from '@shadow-library/ui';

import { PaneError, PaneLoader } from '@/components/nf';
import { useWriterSnapshotQuery, useWriterSnapshotsQuery } from '@/lib/apis';
import { messageTime } from '@/lib/format';
import { attemptWhat, keptBackView, messageLabel, snapshotMeta, writingRuns } from '@/lib/writers-view';

import styles from './ChapterDetails.module.css';

const SAFEGUARDS: readonly [string, string][] = [
  ['1 · Kept back.', 'A locked secret’s truth isn’t in the material at all — the app enforces this.'],
  ['2 · Give-away words scrubbed.', 'Words that would give a secret away are removed from what the writer reads. This catches the words, not every paraphrase.'],
  ['3 · Checked after.', 'A checker that knows the secrets reads the chapter and flags an unplanned disclosure. Allowed clues are fine.'],
];

export interface WritersViewProps {
  novelId: string;
  chapter: number;
}

export function WritersView({ novelId, chapter }: WritersViewProps): React.JSX.Element {
  const listQuery = useWriterSnapshotsQuery(novelId, chapter);
  const runs = writingRuns(listQuery.data?.items ?? []);
  const [runKey, setRunKey] = useState<string | undefined>();
  const [attemptId, setAttemptId] = useState<string | undefined>();
  const run = runs.find(candidate => candidate.key === runKey) ?? runs[0];
  const attempt = run?.attempts.find(candidate => candidate.id === attemptId) ?? run?.attempts[run.attempts.length - 1];
  const detailQuery = useWriterSnapshotQuery(novelId, chapter, attempt?.id);
  const detail = detailQuery.data?.id === attempt?.id ? detailQuery.data : undefined;

  if (listQuery.isLoading) return <PaneLoader />;
  if (listQuery.error) return <PaneError error={listQuery.error} />;
  if (!run || !attempt) {
    return (
      <div className={styles.tab}>
        <span className={styles.muted}>Nothing stored yet. The Writer’s view keeps exactly what the AI writer was sent, each time it writes this chapter.</span>
      </div>
    );
  }

  const total = run.attempts.length;
  const keptBack = keptBackView(detail?.keptBack);

  return (
    <div className={styles.tab}>
      {runs.length > 1 && (
        <Select
          size="sm"
          aria-label="Writing run"
          value={run.key}
          onValueChange={key => {
            setRunKey(key);
            setAttemptId(undefined);
          }}
        >
          {runs.map(candidate => (
            <Select.Item key={candidate.key} value={candidate.key}>
              {candidate.label}
            </Select.Item>
          ))}
        </Select>
      )}
      {total > 1 && (
        <SegmentedControl size="sm" aria-label="Attempt" value={attempt.id} onValueChange={setAttemptId}>
          {run.attempts.map(candidate => (
            <SegmentedControl.Item key={candidate.id} value={candidate.id}>
              Attempt {candidate.attempt}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      )}
      {detail && <span className={styles.meta}>{snapshotMeta(detail, total, messageTime)}</span>}
      <span>{attemptWhat(attempt, total)}</span>
      {detailQuery.error ? (
        <PaneError error={detailQuery.error} />
      ) : !detail ? (
        <PaneLoader />
      ) : (
        <>
          <section className={styles.section} aria-label="Given">
            <span className={styles.cap}>Given</span>
            {detail.messages.map((message, index) => (
              <details key={index} className={styles.message}>
                <summary className={styles.messageHead}>
                  {messageLabel(message.role)} · {message.content.length.toLocaleString()} characters
                </summary>
                <pre className={styles.messageBody}>{message.content}</pre>
              </details>
            ))}
          </section>
          <section className={styles.keptBack} aria-label="Kept from the writer">
            <span className={styles.cap}>Kept from the writer</span>
            {keptBack.secrecy.length === 0 ? <span>– Nothing locked needed withholding</span> : keptBack.secrecy.map(line => <span key={line}>– {line}</span>)}
            <span className={styles.muted}>– Cut for space: {keptBack.budget.length === 0 ? 'none' : keptBack.budget.join(', ')}</span>
          </section>
        </>
      )}
      <section className={styles.section}>
        <span className={styles.cap}>The three safeguards</span>
        {SAFEGUARDS.map(([title, text]) => (
          <span key={title}>
            <b className={styles.name}>{title}</b> {text}
          </span>
        ))}
      </section>
    </div>
  );
}
