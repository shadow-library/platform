import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { type ReactElement, useMemo } from 'react';
import { Banner } from '@shadow-library/ui';

import { describeChanges, useActiveCatalog, useDraft } from '@/features/catalog';
import { formatDateTime, formatRelativeTime, useMinuteClock } from '@/features/shared';
import { meQuery, useCapabilities } from '@/lib';

import styles from './Layout.module.css';

const CHANGES_PATH = '/changes';

export function ChangesBar(): ReactElement | null {
  const capabilities = useCapabilities();
  const pathname = useLocation({ select: location => location.pathname });
  const now = useMinuteClock();
  const me = useQuery(meQuery);
  const draft = useDraft(capabilities.readCatalog);
  const saved = draft.status === 'ready' ? draft.draft : null;
  const active = useActiveCatalog(saved !== null);
  const activeDocument = active.status === 'ready' ? active.document : null;
  const settled = active.status === 'ready' || active.status === 'none';
  const count = useMemo(() => (saved && settled ? describeChanges(activeDocument, saved.draft.document).length : 0), [saved, settled, activeDocument]);

  if (!saved || count === 0 || pathname.replace(/\/$/, '') === CHANGES_PATH) return null;

  const started = now !== null ? formatRelativeTime(saved.draft.createdAt, new Date(now)) : formatDateTime(saved.draft.createdAt);
  const yours = me.data !== undefined && saved.draft.createdBy === me.data.sub;
  return (
    <Banner
      intent="info"
      className={styles.notice}
      message={
        <>
          {count === 1 ? '1 unpublished change' : `${count} unpublished changes`}
          {yours ? ' · last saved by you' : ''} · draft started {started} · <Link to={CHANGES_PATH}>Review</Link>
        </>
      }
    />
  );
}
