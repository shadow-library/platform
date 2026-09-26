import { type ReactElement, useMemo } from 'react';

import { Alert, Pagination } from '@shadow-library/ui';

import { PaneLoader, StatusChip } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { type PromiseItemResponse } from '@/lib/apis';
import { chapterLabel, kindLabel, lastMoved, payoffLabels, type PayoffLookup, PROMISE_PAGE_SIZE, promiseGroups, quietestPromise, statusChips } from '@/lib/promises';

import detailStyles from './BibleDetails.module.css';
import { ListHead } from './EntryList';
import styles from './StoryBible.module.css';

export type PromisesState =
  { status: 'loading' } | { status: 'error'; message: string; onRetry: () => void } | { status: 'ready'; items: readonly PromiseItemResponse[]; total: number };

export function ThreadsList({ promises }: { promises: PromisesState }): ReactElement {
  const groups = useMemo(() => (promises.status === 'ready' ? promiseGroups(promises.items) : []), [promises]);

  let body: ReactElement;
  if (promises.status === 'loading') body = <p className={styles.listEmpty}>Loading promises…</p>;
  else if (promises.status === 'error') body = <p className={styles.listEmpty}>Couldn’t load promises.</p>;
  else if (groups.length === 0) body = <p className={styles.listEmpty}>No promises yet.</p>;
  else
    body = (
      <>
        {groups.map(group => (
          <section key={group.key} aria-label={group.label}>
            <h3 className={styles.groupHead}>
              {group.label} · {group.items.length}
            </h3>
            <ul className={styles.rows}>
              {group.items.map(item => (
                <li key={`${item.kind}:${item.key}`} className={detailStyles.promiseRow}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{item.label}</span>
                    <span className={styles.rowSummary}>
                      {kindLabel(item)} · last moved {chapterLabel(lastMoved(item))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </>
    );

  return (
    <>
      <ListHead title="Threads & promises" description="Open questions, setups and relationships the reader is following." />
      {body}
    </>
  );
}

export interface PromisesTableProps {
  items: readonly PromiseItemResponse[];
  lookup: PayoffLookup;
}

export function PromisesTable({ items, lookup }: PromisesTableProps): ReactElement {
  const ordered = promiseGroups(items).flatMap(group => group.items);
  return (
    <div role="table" aria-label="Promises" className={detailStyles.promiseTable}>
      <div role="row" className={`${detailStyles.promiseGrid} ${detailStyles.promiseHead}`}>
        <span role="columnheader">Promise</span>
        <span role="columnheader">Opened</span>
        <span role="columnheader">Last moved</span>
        <span role="columnheader">Pay off</span>
        <span role="columnheader">Status</span>
      </div>
      {ordered.map(item => (
        <div key={`${item.kind}:${item.key}`} role="row" className={`${detailStyles.promiseGrid} ${detailStyles.promiseBody}`}>
          <span role="cell" className={detailStyles.promiseName}>
            <span className={detailStyles.promiseLabel}>{item.label}</span>
            <span className={detailStyles.promiseKind}>{kindLabel(item)}</span>
          </span>
          <span role="cell" data-label="Opened" className={detailStyles.promiseCell}>
            {chapterLabel(item.openedChapter)}
          </span>
          <span role="cell" data-label="Last moved" className={detailStyles.promiseCell}>
            {chapterLabel(lastMoved(item))}
          </span>
          <span role="cell" data-label="Pay off" className={detailStyles.promiseChips}>
            {payoffLabels(item, lookup).map(label => (
              <StatusChip key={label} intent="neutral">
                {label}
              </StatusChip>
            ))}
          </span>
          <span role="cell" className={detailStyles.promiseChips}>
            {statusChips(item).map(chip => (
              <StatusChip key={chip.text} intent={chip.intent}>
                {chip.text}
              </StatusChip>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface ThreadsPaneProps {
  novelId: string;
  promises: PromisesState;
  lookup: PayoffLookup;
  nextChapter: number | undefined;
  page: number;
  onPage: (page: number) => void;
}

/** Changes to a promise go through the chat, which stages them as cards the server's write policy asks the author to accept. */
export function ThreadsPane({ novelId, promises, lookup, nextChapter, page, onPage }: ThreadsPaneProps): ReactElement {
  const quiet = promises.status === 'ready' ? quietestPromise(promises.items, nextChapter) : undefined;

  let body: ReactElement;
  if (promises.status === 'loading') body = <PaneLoader />;
  else if (promises.status === 'error')
    body = (
      <Alert intent="danger" title="Couldn’t load promises" action={{ label: 'Retry', onClick: promises.onRetry }}>
        {promises.message}
      </Alert>
    );
  else if (promises.total === 0)
    body = <p className={styles.muted}>No promises yet. They come from chapters you finalize — you confirm each one — or from you, through the chat below.</p>;
  else
    body = (
      <>
        {quiet && (
          <div className={detailStyles.quietNotice}>
            <span>
              <b>“{quiet.item.label}”</b> hasn’t moved since chapter {quiet.since} — {quiet.chapters} chapters. A quiet promise is a reminder, not an error; ask the chat below to
              mark it dormant on purpose if it is meant to wait.
            </span>
          </div>
        )}
        <PromisesTable items={promises.items} lookup={lookup} />
        {promises.total > PROMISE_PAGE_SIZE && <Pagination page={page} total={promises.total} pageSize={PROMISE_PAGE_SIZE} onPageChange={onPage} />}
      </>
    );

  return (
    <section className={styles.pane} aria-label="Threads & promises">
      <div className={detailStyles.paneHead}>
        <h2 className={styles.paneTitle}>Threads &amp; promises</h2>
        <StatusChip intent="neutral">What the reader is waiting for</StatusChip>
      </div>
      <p className={detailStyles.paneIntro}>
        Every question the story has opened, when it last moved, and where you mean to pay it off. The chat brings the ones that matter into each chapter’s planning. Nothing here
        has a deadline; a quiet promise is a reminder, not an error.
      </p>
      {body}
      <ForgeBar
        novelId={novelId}
        scope={{ type: 'novel', title: 'Threads & promises' }}
        placeholder="Ask the chat about a promise — add one, set its pay-off, mark it dormant, paid off or dropped…"
      />
    </section>
  );
}
