/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ConfirmDialog, Dialog, Drawer, DropdownMenu, FormField, IconButton, Input, Spinner, Tag, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { MoreIcon, PlusIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import {
  type DeliveryStatus,
  useCreateWebhookMutation,
  useDeleteWebhookMutation,
  useRedeliverWebhookMutation,
  useRotateWebhookSecretMutation,
  useWebhookDeliveriesQuery,
  useWebhooksQuery,
  webhooksQueryOptions,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './console.module.css';

export const Route = createFileRoute('/console/webhooks')({
  loader: ({ context }) => context.queryClient.ensureQueryData(webhooksQueryOptions()),
  component: WebhooksPage,
});

const DELIVERY_INTENT: Record<DeliveryStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  SENT: 'success',
  PENDING: 'neutral',
  SENDING: 'neutral',
  FAILED: 'warning',
  DEAD: 'danger',
};

function CreateWebhookDialog({ open, onOpenChange, onSecret }: { open: boolean; onOpenChange: (open: boolean) => void; onSecret: (secret: string) => void }): React.JSX.Element {
  const create = useCreateWebhookMutation();
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [events, setEvents] = useState<TokenValue[]>([]);

  const submit = (): void => {
    const eventTypes = events.filter(token => token.valid).map(token => token.value);
    if (!name.trim() || !targetUrl.trim() || eventTypes.length === 0) {
      toast.danger('Name, target URL, and at least one event are required.');
      return;
    }
    create.mutate(
      { name: name.trim(), targetUrl: targetUrl.trim(), eventTypes },
      {
        onSuccess: result => {
          toast.success('Webhook created');
          onOpenChange(false);
          setName('');
          setTargetUrl('');
          setEvents([]);
          onSecret(result.secret);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Create webhook" description="Receive audit events at an https endpoint you control." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Name" required>
              <Input value={name} onValueChange={setName} placeholder="Security events" autoFocus />
            </FormField>
            <FormField label="Target URL" required helper="Must be a public https URL.">
              <Input value={targetUrl} onValueChange={setTargetUrl} placeholder="https://example.com/hooks/shadow" />
            </FormField>
            <FormField label="Event types" required helper="Exact actions, prefix.* wildcards, or *.">
              <TokenInput value={events} onValueChange={setEvents} placeholder="user.locked" />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Create webhook
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function DeliveriesDrawer({ webhookId, open, onOpenChange }: { webhookId: string | null; open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const deliveries = useWebhookDeliveriesQuery(webhookId ?? '', undefined, Boolean(webhookId));
  const redeliver = useRedeliverWebhookMutation();
  const items = deliveries.data?.items ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="lg" aria-label="Webhook deliveries">
      <Drawer.Header title="Recent deliveries" />
      <Drawer.Body>
        {deliveries.isLoading ? (
          <Spinner size="lg" />
        ) : items.length === 0 ? (
          <div style={{ color: 'var(--sh-text-tertiary)', fontSize: 13 }}>No deliveries yet.</div>
        ) : (
          <div className={styles.rowList}>
            {items.map(delivery => (
              <div key={delivery.id} className={styles.listRow}>
                <div className={styles.listMain}>
                  <div className={styles.listName}>
                    {delivery.eventType}
                    <StatusChip intent={DELIVERY_INTENT[delivery.status]} dot>
                      {delivery.status.toLowerCase()}
                    </StatusChip>
                  </div>
                  <div className={styles.listSub}>
                    {delivery.attemptCount} attempt{delivery.attemptCount === 1 ? '' : 's'}
                    {delivery.responseStatus ? ` · HTTP ${delivery.responseStatus}` : ''} · {relativeTime(delivery.createdAt)}
                    {delivery.lastError ? ` · ${delivery.lastError}` : ''}
                  </div>
                </div>
                {(delivery.status === 'FAILED' || delivery.status === 'DEAD') && webhookId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => redeliver.mutate({ webhookId, deliveryId: delivery.id }, { onSuccess: () => toast.success('Queued for redelivery') })}
                  >
                    Redeliver
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer.Body>
    </Drawer>
  );
}

function WebhooksPage(): React.JSX.Element {
  const webhooks = useWebhooksQuery();
  const rotate = useRotateWebhookSecretMutation();
  const del = useDeleteWebhookMutation();
  const { require, dialog } = useStepUpGate();
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const list = webhooks.data?.items ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Webhooks"
        subtitle="Deliver audit events to your systems, signed and retried."
        actions={
          <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={() => require(() => setCreateOpen(true))}>
            Create webhook
          </Button>
        }
      />

      <QueryState
        isLoading={webhooks.isLoading}
        error={webhooks.error}
        isEmpty={list.length === 0}
        emptyTitle="No webhooks"
        emptyDescription="Create a webhook to stream audit events."
      >
        <div className={styles.rowList}>
          {list.map(webhook => (
            <div key={webhook.id} className={styles.listRow}>
              <div className={styles.listMain}>
                <div className={styles.listName}>
                  {webhook.name}
                  <StatusChip intent={webhook.isActive ? 'success' : 'neutral'} dot>
                    {webhook.isActive ? 'Active' : 'Inactive'}
                  </StatusChip>
                </div>
                <div className={styles.listSub}>{webhook.targetUrl}</div>
                <div className={styles.tags}>
                  {webhook.eventTypes.slice(0, 6).map(event => (
                    <Tag key={event} size="sm">
                      {event}
                    </Tag>
                  ))}
                  {webhook.eventTypes.length > 6 && <Tag size="sm">+{webhook.eventTypes.length - 6}</Tag>}
                </div>
              </div>
              <div className={styles.listActions}>
                <Button variant="ghost" size="sm" onClick={() => setDeliveriesFor(webhook.id)}>
                  Deliveries
                </Button>
                <DropdownMenu>
                  <DropdownMenu.Trigger asChild>
                    <IconButton variant="ghost" size="sm" aria-label="Webhook actions" icon={<MoreIcon size={16} />} />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item
                      onSelect={() => require(() => rotate.mutate(webhook.id, { onSuccess: result => setSecret(result.secret), onError: error => toast.danger(error.message) }))}
                    >
                      Rotate secret
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item destructive onSelect={() => setDeleteTarget(webhook)}>
                      Delete webhook
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </QueryState>

      <CreateWebhookDialog open={createOpen} onOpenChange={setCreateOpen} onSecret={setSecret} />
      <DeliveriesDrawer webhookId={deliveriesFor} open={deliveriesFor !== null} onOpenChange={open => !open && setDeliveriesFor(null)} />
      <SecretDialog
        open={secret !== null}
        onOpenChange={open => !open && setSecret(null)}
        title="Webhook signing secret"
        description="Verify the x-shadow-webhook-signature header with this secret. It’s shown only once."
        secret={secret ?? undefined}
        downloadName="webhook-secret.txt"
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => !open && setDeleteTarget(null)}
        intent="danger"
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete webhook?'}
        description="Deliveries to this endpoint will stop immediately."
        confirmLabel="Delete webhook"
        loading={del.isPending}
        onConfirm={() =>
          deleteTarget &&
          require(() =>
            del.mutate(deleteTarget.id, {
              onSuccess: () => {
                toast.success('Webhook deleted');
                setDeleteTarget(null);
              },
              onError: error => toast.danger(error.message),
            }),
          )
        }
      />
      {dialog}
    </div>
  );
}
