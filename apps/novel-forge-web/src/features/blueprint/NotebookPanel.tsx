import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, Spinner, Textarea, toast } from '@shadow-library/ui';

import { SidePanel, StatusChip } from '@/components/nf';
import { type LedgerEntryResponse, useLedgerEntriesQuery, useLedgerTopicQuery, useWithdrawLedgerEntryMutation } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import { groupEntriesByPhase, isWithdrawable, LEDGER_KIND_LABELS, LEDGER_STATUS_LABELS, ledgerTopicLabel, newLedgerEntryIds, notebookCounts } from './notebook';
import styles from './blueprint.module.css';

const KIND_INTENT = { decision: 'success', system: 'info', direction: 'accent', rejected: 'danger', backlog: 'neutral' } as const;

const EMPTY = 'Empty. Every choice you lock, every direction you keep and every idea you kill collects here.';

const FOOT = 'Every step reads this, not the chat. Rejected lines reach the model only as “don’t propose”.';

// A stable identity for "nothing loaded yet", so the new-entry effect can tell a first paint from an empty ledger.
const NO_ENTRIES: LedgerEntryResponse[] = [];

interface EntryRowProps {
  entry: LedgerEntryResponse;
  isNew: boolean;
  onOpenTopic: (topic: string) => void;
}

function EntryRow({ entry, isNew, onOpenTopic }: EntryRowProps): ReactElement {
  return (
    <article className={styles.nbEntry} data-kind={entry.kind} data-new={isNew || undefined}>
      <div className={styles.nbEntryHead}>
        <StatusChip intent={KIND_INTENT[entry.kind]}>{LEDGER_KIND_LABELS[entry.kind]}</StatusChip>
        {isNew && <span className={styles.nbNew}>new</span>}
        <button type="button" className={styles.nbTopic} aria-label={`${ledgerTopicLabel(entry.topic)} — open its history`} onClick={() => onOpenTopic(entry.topic)}>
          {ledgerTopicLabel(entry.topic)}
        </button>
      </div>
      <p className={styles.nbStatement}>{entry.statement}</p>
      {entry.why != null && <p className={styles.nbWhy}>{entry.why}</p>}
      {entry.writerLine != null && <p className={styles.nbWriterLine}>Means for the writer: {entry.writerLine}</p>}
    </article>
  );
}

interface TopicHistoryProps {
  projectId: string;
  topic: string | null;
  onClose: () => void;
}

function TopicHistory({ projectId, topic, onClose }: TopicHistoryProps): ReactElement {
  const historyQuery = useLedgerTopicQuery(projectId, topic ?? '', topic != null);
  const withdraw = useWithdrawLedgerEntryMutation(projectId);
  const [withdrawing, setWithdrawing] = useState<LedgerEntryResponse | null>(null);
  const [reason, setReason] = useState('');

  const submitWithdraw = (): void => {
    const target = withdrawing;
    const trimmed = reason.trim();
    if (!target || !trimmed) return;
    withdraw.mutate(
      { entryId: target.id, reason: trimmed },
      {
        onSuccess: () => {
          setWithdrawing(null);
          setReason('');
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <>
      <Dialog open={topic != null} onOpenChange={next => !next && onClose()}>
        <Dialog.Content size="md">
          <Dialog.Header
            title={topic != null ? ledgerTopicLabel(topic) : 'Topic'}
            description="Everything this topic has said, newest last. Nothing is deleted: a change appends, and a withdrawal keeps its reason."
          />
          <Dialog.Body>
            {historyQuery.isLoading ? (
              <Spinner size="lg" label="Loading" />
            ) : historyQuery.error ? (
              <Alert intent="danger" title="Couldn’t load the history">
                {historyQuery.error.message}
              </Alert>
            ) : (
              <div className={styles.nbHistory}>
                {(historyQuery.data?.entries ?? []).map(entry => (
                  <article key={entry.id} className={styles.nbHistoryRow} data-status={entry.status}>
                    <div className={styles.nbEntryHead}>
                      <StatusChip intent={KIND_INTENT[entry.kind]}>{LEDGER_KIND_LABELS[entry.kind]}</StatusChip>
                      {entry.status !== 'active' && <StatusChip intent="neutral">{LEDGER_STATUS_LABELS[entry.status]}</StatusChip>}
                      <span className={styles.nbWhen}>{relativeTime(entry.createdAt)}</span>
                    </div>
                    <p className={styles.nbStatement}>{entry.statement}</p>
                    {entry.why != null && <p className={styles.nbWhy}>{entry.why}</p>}
                    {entry.withdrawnReason != null && <p className={styles.nbWhy}>Withdrawn: {entry.withdrawnReason}</p>}
                    {isWithdrawable(entry) && (
                      <Button size="sm" variant="ghost" onClick={() => setWithdrawing(entry)}>
                        Withdraw
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Close</Button>
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog open={withdrawing != null} onOpenChange={next => !next && setWithdrawing(null)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title="Withdraw this entry?"
            description="It stops steering later steps and stays in the topic’s history with your reason. Withdrawing a rejection lifts the ban."
          />
          <Dialog.Body>
            <Textarea placeholder="Why you’re dropping it" value={reason} onValueChange={setReason} minRows={3} autoGrow autoFocus />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={withdraw.isPending} disabled={!reason.trim()} onClick={submitWithdraw}>
              Withdraw
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </>
  );
}

export interface NotebookPanelProps {
  projectId: string;
  className?: string;
}

/**
 * The Notebook: the active ledger, newest first and grouped by the phase that decided it. Entries that
 * landed since the panel last looked are marked new, which is the only signal the author gets that a lock
 * or a kept steer reached the record.
 */
export function NotebookPanel({ projectId, className }: NotebookPanelProps): ReactElement {
  const entriesQuery = useLedgerEntriesQuery(projectId);
  const entries = entriesQuery.data?.entries ?? NO_ENTRIES;
  const counts = notebookCounts(entries);
  const groups = groupEntriesByPhase(entries);

  const [topic, setTopic] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set());
  const seenRef = useRef<{ projectId: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (entries === NO_ENTRIES) return;
    const previous = seenRef.current;
    const sameProject = previous != null && previous.projectId === projectId;
    const fresh = newLedgerEntryIds(entries, sameProject ? previous.ids : null);
    seenRef.current = { projectId, ids: new Set(entries.map(entry => entry.id)) };
    if (!sameProject) setNewIds(new Set());
    else if (fresh.length > 0) setNewIds(new Set(fresh));
  }, [entries, projectId]);

  return (
    <SidePanel
      className={className}
      title="Notebook"
      titleAccessory={counts.total > 0 ? <StatusChip intent="neutral">{counts.total}</StatusChip> : undefined}
      summary={`${counts.decided} decided, ${counts.directions} directions, ${counts.rejected} rejected`}
      total={entriesQuery.isLoading || entriesQuery.error != null ? 1 : counts.total}
      empty={EMPTY}
      footer={<span className={styles.nbFoot}>{FOOT}</span>}
    >
      {entriesQuery.error != null ? (
        <Alert intent="danger" title="Couldn’t load the Notebook">
          {entriesQuery.error.message}
        </Alert>
      ) : entriesQuery.isLoading ? (
        <Spinner size="lg" label="Loading" />
      ) : (
        <>
          <div className={styles.nbCounts}>
            <div>
              <strong>{counts.decided}</strong>
              <span>decided</span>
            </div>
            <div>
              <strong>{counts.directions}</strong>
              <span>directions</span>
            </div>
            <div>
              <strong>{counts.rejected}</strong>
              <span>rejected</span>
            </div>
          </div>
          {groups.map(group => (
            <section key={group.label} className={styles.nbGroup}>
              <h3 className={styles.nbGroupLabel}>
                {group.label} · {group.entries.length}
              </h3>
              {group.entries.map(entry => (
                <EntryRow key={entry.id} entry={entry} isNew={newIds.has(entry.id)} onOpenTopic={setTopic} />
              ))}
            </section>
          ))}
        </>
      )}
      <TopicHistory projectId={projectId} topic={topic} onClose={() => setTopic(null)} />
    </SidePanel>
  );
}
