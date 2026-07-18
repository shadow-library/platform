/**
 * Importing npm packages
 */
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Drawer, SegmentedControl } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { type NotificationChannel } from '@/lib';

import { OutlineBadge } from './cells';
import { PulseSquare } from './icons';
import styles from './ViewerDrawer.module.css';

/**
 * Defining types
 */
export interface ViewerData {
  channel: NotificationChannel;
  title: string;
  meta?: string;
  recipient?: string;
  subject?: string;
  body: string;
  rawSubject?: string;
  rawBody?: string;
  payload?: Record<string, unknown> | null;
}

export interface ViewerDrawerProps {
  open: boolean;
  data: ViewerData | null;
  onOpenChange: (open: boolean) => void;
}

type ViewerMode = 'rendered' | 'source';

/**
 * Read-only inspector for a variant template or a sent message: a rendered channel preview
 * (email / SMS / push) with a toggle to the raw template source and rendering payload.
 */
export function ViewerDrawer({ open, data, onOpenChange }: ViewerDrawerProps): ReactElement {
  const [mode, setMode] = useState<ViewerMode>('rendered');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) setMode('rendered');
    wasOpen.current = open;
  }, [open]);

  const hasPayload = !!data?.payload && Object.keys(data.payload).length > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="right" size="lg">
      <Drawer.Header title={data?.title ?? 'Preview'} meta={data?.meta} />
      <Drawer.Body>
        {data ? (
          <>
            <div className={styles.top}>
              <OutlineBadge>{data.channel}</OutlineBadge>
              <SegmentedControl size="sm" value={mode} onValueChange={value => setMode(value as ViewerMode)}>
                <SegmentedControl.Item value="rendered">Rendered</SegmentedControl.Item>
                <SegmentedControl.Item value="source">Source</SegmentedControl.Item>
              </SegmentedControl>
            </div>

            {mode === 'rendered' ? <Preview data={data} /> : <Source data={data} />}

            {hasPayload ? (
              <div className={styles.payloadBlock}>
                <div className={styles.label}>Payload used to render</div>
                <pre className={styles.payloadPre}>{JSON.stringify(data.payload, null, 2)}</pre>
              </div>
            ) : null}
          </>
        ) : null}
      </Drawer.Body>
    </Drawer>
  );
}

function Preview({ data }: { data: ViewerData }): ReactElement {
  if (data.channel === 'EMAIL') return <EmailPreview subject={data.subject ?? ''} body={data.body} recipient={data.recipient} />;
  if (data.channel === 'SMS') return <SmsPreview body={data.body} recipient={data.recipient} />;
  return <PushPreview body={data.body} />;
}

function Source({ data }: { data: ViewerData }): ReactElement {
  const subject = data.rawSubject ?? data.subject;
  return (
    <>
      {subject ? (
        <>
          <div className={styles.label}>Subject</div>
          <div className={styles.sourceSubject}>{subject}</div>
        </>
      ) : null}
      <div className={styles.label}>Body</div>
      <pre className={styles.sourcePre}>{data.rawBody ?? data.body}</pre>
    </>
  );
}

function EmailPreview({ subject, body, recipient }: { subject: string; body: string; recipient?: string }): ReactElement {
  return (
    <div className={styles.emailCard}>
      <div className={styles.emailHeader}>
        <div className={styles.emailSubject}>{subject || '(no subject)'}</div>
        <div className={styles.emailFrom}>
          <div className={styles.emailAvatar}>P</div>
          <div className={styles.emailMetaCol}>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>From</span>
              <span className={styles.metaValue}>Pulse Notifications ‹notifications@pulse.app›</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>To</span>
              <span className={styles.metaValueMono}>{recipient || 'recipient@example.com'}</span>
            </div>
          </div>
        </div>
      </div>
      {/* Template/message body is admin-authored content rendered into an isolated preview surface. */}
      <div className={styles.emailBodyWrap}>
        <div className={styles.emailBody} dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    </div>
  );
}

function SmsPreview({ body, recipient }: { body: string; recipient?: string }): ReactElement {
  const length = body.length;
  const segments = Math.max(1, Math.ceil(length / 160));
  return (
    <div className={styles.smsWrap}>
      <div className={styles.smsHeader}>SMS · {recipient || '+1 000 000 0000'}</div>
      <div className={styles.smsBubbleRow}>
        <div className={styles.smsBubble}>{body}</div>
      </div>
      <div className={styles.smsFooter}>
        {length} chars · {segments} segment{segments > 1 ? 's' : ''}
      </div>
    </div>
  );
}

function PushPreview({ body }: { body: string }): ReactElement {
  const newline = body.indexOf('\n');
  const title = newline === -1 ? body : body.slice(0, newline);
  const rest = newline === -1 ? '' : body.slice(newline + 1);
  return (
    <div className={styles.pushWrap}>
      <div className={styles.pushLabel}>Lock-screen notification</div>
      <div className={styles.pushCard}>
        <div className={styles.pushTop}>
          <PulseSquare size={20} radius={5} />
          <span className={styles.pushName}>Pulse</span>
          <span className={styles.pushTime}>now</span>
        </div>
        <div className={styles.pushTitle}>{title || 'Notification'}</div>
        <div className={styles.pushBody}>{rest}</div>
      </div>
    </div>
  );
}
