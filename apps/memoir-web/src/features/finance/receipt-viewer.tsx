import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Alert, type AlertIntent, Button, Skeleton } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import { RECEIPT_DOWNLOAD_FAILURE_COPY, type ReceiptDownloadFailure, toReceiptDownloadError } from '@/lib/apis';
import { type ReceiptLink, useMemoirData } from '@/lib/data';

import styles from './finance.module.css';

export interface ReceiptViewerProps {
  receiptRef: string;
  subject: string;
}

type ReceiptLinkState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; link: ReceiptLink; staleAt: number; preview: 'image' | 'unavailable' }
  | { kind: 'expired' }
  | { kind: 'failed'; failure: ReceiptDownloadFailure };

const EXPIRY_MARGIN_MS = 60_000;
const FALLBACK_LIFETIME_MS = 60_000;
/** The server presigns for 15 minutes; a slow device clock would otherwise stretch a link past it. */
const MAX_LIFETIME_MS = 15 * 60_000;

const FAILURE_ALERTS: Record<ReceiptDownloadFailure, { intent: AlertIntent; title: string }> = {
  'not-found': { intent: 'warning', title: 'Receipt photo not found' },
  offline: { intent: 'warning', title: 'No connection' },
  failed: { intent: 'danger', title: 'Couldn’t load the receipt photo' },
};

function staleAtFor(link: ReceiptLink, receivedAt: number): number {
  const lifetime = Math.min(Date.parse(link.expiresAt) - receivedAt, MAX_LIFETIME_MS);
  if (!(lifetime > 0)) return receivedAt + FALLBACK_LIFETIME_MS;
  return receivedAt + (lifetime > EXPIRY_MARGIN_MS ? lifetime - EXPIRY_MARGIN_MS : lifetime);
}

function isFresh(state: ReceiptLinkState): boolean {
  return state.kind === 'ready' && state.preview === 'image' && Date.now() < state.staleAt;
}

interface ReceiptBodyProps {
  state: ReceiptLinkState;
  subject: string;
  onRetry: () => void;
  onPreviewUnavailable: () => void;
}

function ReceiptBody({ state, subject, onRetry, onPreviewUnavailable }: ReceiptBodyProps): ReactElement {
  switch (state.kind) {
    case 'idle':
    case 'loading':
      return (
        <div role="status" aria-busy="true" aria-label="Loading the receipt photo">
          <Skeleton shape="rect" width="100%" height={240} />
        </div>
      );
    case 'ready':
      if (state.preview === 'unavailable')
        return (
          <Alert intent="info" title="The photo didn’t show" action={{ label: 'Load again', onClick: onRetry }}>
            The connection may have dropped, or this browser can’t display the file type. Load it again, or open the photo to view or save it.
          </Alert>
        );
      return <img className={styles.receiptImage} src={state.link.url} alt={`Receipt for ${subject}`} onError={onPreviewUnavailable} />;
    case 'expired':
      return (
        <Alert intent="info" title="This view has expired" action={{ label: 'Load again', onClick: onRetry }}>
          A receipt link only works for a short while. Load the photo again to keep viewing it.
        </Alert>
      );
    case 'failed': {
      const alert = FAILURE_ALERTS[state.failure];
      const action = state.failure === 'not-found' ? undefined : { label: 'Try again', onClick: onRetry };
      return (
        <Alert intent={alert.intent} title={alert.title} action={action}>
          {RECEIPT_DOWNLOAD_FAILURE_COPY[state.failure]}
        </Alert>
      );
    }
  }
}

export function ReceiptViewer({ receiptRef, subject }: ReceiptViewerProps): ReactElement {
  const { finance } = useMemoirData();
  const attempt = useRef(0);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReceiptLinkState>({ kind: 'idle' });
  const link = state.kind === 'ready' ? state.link : null;
  const staleAt = state.kind === 'ready' ? state.staleAt : null;

  useEffect(() => {
    if (staleAt === null) return undefined;
    const timer = setTimeout(() => setState({ kind: 'expired' }), Math.max(staleAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [staleAt]);

  const load = async (): Promise<void> => {
    const current = ++attempt.current;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setState({ kind: 'failed', failure: 'offline' });
    setState({ kind: 'loading' });
    try {
      const issued = await finance.receiptLink(receiptRef);
      if (current === attempt.current) setState({ kind: 'ready', link: issued, staleAt: staleAtFor(issued, Date.now()), preview: 'image' });
    } catch (error) {
      if (current === attempt.current) setState({ kind: 'failed', failure: toReceiptDownloadError(error).failure });
    }
  };

  const changeOpen = (next: boolean): void => {
    setOpen(next);
    if (next && state.kind !== 'loading' && !isFresh(state)) void load();
  };

  const footer = link ? (
    <Button variant="secondary" asChild>
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        Open photo
      </a>
    </Button>
  ) : undefined;

  return (
    <>
      <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => changeOpen(true)}>
        View receipt
      </Button>
      <OverlaySurface open={open} onOpenChange={changeOpen} title="Receipt photo" description={subject} size="md" footer={footer}>
        <ReceiptBody
          state={state}
          subject={subject}
          onRetry={() => void load()}
          onPreviewUnavailable={() => setState(current => (current.kind === 'ready' ? { ...current, preview: 'unavailable' } : current))}
        />
      </OverlaySurface>
    </>
  );
}
