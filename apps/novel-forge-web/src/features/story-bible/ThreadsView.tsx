import { type ReactElement } from 'react';

import { Alert } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';

import detailStyles from './BibleDetails.module.css';
import { ListHead } from './EntryList';
import styles from './StoryBible.module.css';

export function ThreadsList(): ReactElement {
  return (
    <>
      <ListHead title="Threads & promises" description="Open questions, setups and relationships the reader is following." />
      <p className={styles.listEmpty}>This list can’t be shown yet — the server doesn’t send promises to this page.</p>
    </>
  );
}

/** Promises live on thread and mystery records the server does not list yet; every change still goes through the chat, which stages it as a card. */
export function ThreadsPane({ novelId }: { novelId: string }): ReactElement {
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
      <Alert intent="info" title="Promises can’t be listed here yet">
        The server keeps them — opened, last moved, pay-off and status — but has no way to send them to this page. Ask the chat below to add one, set its pay-off, mark it dormant
        on purpose, paid off or dropped; each change comes back as a card for you to accept.
      </Alert>
      <ForgeBar
        novelId={novelId}
        scope={{ type: 'novel', title: 'Threads & promises' }}
        placeholder="Ask the chat about a promise — add one, set its pay-off, mark it dormant, paid off or dropped…"
      />
    </section>
  );
}
