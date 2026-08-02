/**
 * Importing npm packages
 */
import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Card, Combobox, FormField, Input, Textarea } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { Mono, type Option, OutlineBadge, PageHeader, trimToUndefined } from '@/features/shared';
import { type CreateNotificationBody, type CreateNotificationResponse, type NotificationRecipients, useCreateNotificationMutation, useListTemplatesQuery } from '@/lib';

import styles from './Send.module.css';

const EMPTY = { templateKey: '', email: '', phone: '', push: '', payload: '', locale: '', service: '' };

export default function SendForm(): ReactElement {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateNotificationResponse | null>(null);
  const mutation = useCreateNotificationMutation();

  const { data: templatesData } = useListTemplatesQuery({ limit: 100 });
  const templateOptions: Option[] = (templatesData?.items ?? []).map(template => ({ value: template.templateKey, label: template.templateKey }));

  const update = (patch: Partial<typeof form>): void => setForm(prev => ({ ...prev, ...patch }));

  const runSend = (): void => {
    const recipients: NotificationRecipients = {};
    if (form.email.trim()) recipients.email = form.email.trim();
    if (form.phone.trim()) recipients.phone = form.phone.trim();
    if (form.push.trim()) recipients.push = form.push.trim();

    if (!form.templateKey || Object.keys(recipients).length === 0) {
      setResult(null);
      setError('Select a template key and provide at least one recipient (email, phone, or push token).');
      return;
    }

    let payload: Record<string, unknown> | undefined;
    if (form.payload.trim()) {
      try {
        payload = JSON.parse(form.payload);
      } catch {
        setResult(null);
        setError('Payload is not valid JSON.');
        return;
      }
    }

    setError('');
    const body: CreateNotificationBody = { templateKey: form.templateKey, recipients, locale: trimToUndefined(form.locale), service: trimToUndefined(form.service) };
    if (payload) body.payload = payload as CreateNotificationBody['payload'];
    mutation.mutate(body, {
      onSuccess: data => setResult(data),
      onError: apiError => {
        setResult(null);
        setError(apiError.message);
      },
    });
  };

  const reset = (): void => {
    setForm(EMPTY);
    setError('');
    setResult(null);
  };

  return (
    <div className={styles.page}>
      <PageHeader title="Send Notification" subtitle="Manually trigger a send to test templates and routing end-to-end." />
      <Card padding="lg">
        <Card.Body className={styles.formCol}>
          <FormField label="Template key" required helper="References an existing template.">
            <Combobox
              options={templateOptions}
              value={form.templateKey || null}
              onValueChange={value => update({ templateKey: value ?? '' })}
              placeholder="Search template keys…"
            />
          </FormField>

          <div>
            <div className={styles.recipientsLabel}>
              Recipients <span className={styles.recipientsHint}>— at least one required</span>
            </div>
            <div className={styles.recipientsGrid}>
              <FormField label="Email" optional>
                <Input value={form.email} onValueChange={value => update({ email: value })} placeholder="user@example.com" />
              </FormField>
              <FormField label="Phone" optional>
                <Input value={form.phone} onValueChange={value => update({ phone: value })} placeholder="+14155550123" />
              </FormField>
              <FormField label="Push token" optional>
                <Input value={form.push} onValueChange={value => update({ push: value })} placeholder="fcm:…" />
              </FormField>
            </div>
          </div>

          <FormField label="Payload" optional helper="JSON key/value data used to render template variables.">
            <Textarea value={form.payload} onValueChange={value => update({ payload: value })} minRows={5} placeholder={'{ "name": "Ada", "code": "448120", "ttl": 10 }'} />
          </FormField>

          <div className={styles.twoCol}>
            <FormField label="Locale" optional>
              <Input value={form.locale} onValueChange={value => update({ locale: value })} placeholder="en-US" />
            </FormField>
            <FormField label="Service" optional helper="Used for routing rule matching.">
              <Input value={form.service} onValueChange={value => update({ service: value })} placeholder="auth" />
            </FormField>
          </div>

          {error ? (
            <Alert intent="danger" title="Cannot send">
              {error}
            </Alert>
          ) : null}

          <div className={styles.actions}>
            <Button variant="primary" onClick={runSend} loading={mutation.isPending}>
              Send notification
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
        </Card.Body>
      </Card>

      {result ? <SendResult result={result} /> : null}
    </div>
  );
}

const INTENT_MAP = { ACCEPTED: 'success', PARTIAL_ACCEPTED: 'warning', FAILED: 'danger' } as const;
const TITLE_MAP = { ACCEPTED: 'Accepted', PARTIAL_ACCEPTED: 'Partially accepted', FAILED: 'Failed' } as const;

function SendResult({ result }: { result: CreateNotificationResponse }): ReactElement {
  const count = result.channelResults.length;
  return (
    <div className={styles.result}>
      <Alert intent={INTENT_MAP[result.status]} title={`Overall status: ${TITLE_MAP[result.status]}`}>
        {count} channel{count > 1 ? 's' : ''} processed.
      </Alert>
      <div className={styles.resultCards}>
        {result.channelResults.map((channel, index) => (
          <Card key={index} padding="sm">
            <Card.Body className={styles.channelRow}>
              <OutlineBadge>{channel.channel}</OutlineBadge>
              {channel.status === 'FAILED' ? (
                <Badge intent="danger" variant="soft" dot>
                  FAILED
                </Badge>
              ) : (
                <Badge intent="info" variant="soft" dot>
                  QUEUED
                </Badge>
              )}
              {channel.locale ? (
                <span className={styles.metaText}>
                  locale <Mono>{channel.locale}</Mono>
                </span>
              ) : null}
              {channel.error ? (
                <span className={styles.errorText}>
                  <Mono>{channel.error.code}</Mono> — {channel.error.message}
                </span>
              ) : null}
              {channel.jobId ? (
                <span className={styles.jobId}>
                  jobId <Mono>{channel.jobId}</Mono>
                </span>
              ) : null}
            </Card.Body>
          </Card>
        ))}
      </div>
    </div>
  );
}
