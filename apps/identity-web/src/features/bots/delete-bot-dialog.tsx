import { useState } from 'react';
import { Alert, Avatar, Button, Dialog, FormField, Input, Select, Spinner, toast } from '@shadow-library/ui';

import { type BotItem, type BotOwnedRecordItem, type BotOwnershipApplicationItem, useBotOwnershipQuery, useDeleteBotMutation } from '@/lib/apis';
import { botErrorMessage, botFieldError } from '@/lib/bot-errors';

import styles from './delete-bot-dialog.module.css';

export interface DeleteBotDialogProps {
  orgId: string;
  organisationName: string;
  bot: BotItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  require: (action: () => void) => void;
  onDeleted: () => void;
}

function describeRecords(records: BotOwnedRecordItem[]): string {
  return records
    .filter(record => record.count > 0)
    .map(record => `${record.count.toLocaleString()} ${record.kind}`)
    .join(' · ');
}

function OwnedRecordsRow({ application }: { application: BotOwnershipApplicationItem }): React.JSX.Element {
  const label = application.displayName ?? application.name;
  const summary = describeRecords(application.records);
  return (
    <li className={styles.appRow}>
      <Avatar name={label} src={application.logoUrl} shape="square" size="sm" alt="" />
      <span className={styles.appName}>{label}</span>
      {application.available ? (
        <span className={summary ? styles.appCount : styles.appEmpty}>{summary || 'Nothing owned'}</span>
      ) : (
        <span className={styles.appUnknown}>Couldn’t reach this app</span>
      )}
    </li>
  );
}

export function DeleteBotDialog({ orgId, organisationName, bot, open, onOpenChange, require, onDeleted }: DeleteBotDialogProps): React.JSX.Element {
  const ownership = useBotOwnershipQuery(orgId, bot.id, open);
  const remove = useDeleteBotMutation(orgId);
  const [recipient, setRecipient] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recipientError, setRecipientError] = useState<string | undefined>();

  const reset = (): void => {
    setRecipient('');
    setConfirmation('');
    setRecipientError(undefined);
  };

  /** The server decides eligibility — a closed account keeps an ACTIVE membership, so the picker must never reason about it here. */
  const recipients = ownership.data?.recipients ?? [];
  const applications = ownership.data?.applications ?? [];
  const ready = confirmation === bot.handle && recipient !== '';

  const submit = (): void => {
    setRecipientError(undefined);
    if (!ready) return;
    require(() =>
      remove.mutate(
        { botId: bot.id, body: { transferToUserId: recipient, confirmHandle: confirmation } },
        {
          onSuccess: () => {
            toast.success(`${bot.displayName} is being deleted`);
            onOpenChange(false);
            reset();
            onDeleted();
          },
          onError: error => {
            const fieldError = botFieldError(error);
            if (fieldError?.field === 'transferToUserId') setRecipientError(fieldError.message);
            else toast.danger(botErrorMessage(error));
          },
        },
      ),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Content size="md">
        <Dialog.Header title={`Delete ${bot.handle}[bot]?`} description="This bot owns records. They’ll move to a member before the bot is deleted." />
        <Dialog.Body>
          <div className={styles.stack}>
            <section className={styles.appPanel} aria-busy={ownership.isLoading || undefined}>
              <h4 className={styles.appPanelTitle}>Owned records</h4>
              {ownership.isLoading && (
                <div className={styles.appLoading}>
                  <Spinner size="sm" label="Counting owned records" />
                </div>
              )}
              {!ownership.isLoading && applications.length === 0 && <p className={styles.appEmptyPanel}>No app tracks records for this bot.</p>}
              {applications.length > 0 && (
                <ul className={styles.appList}>
                  {applications.map(application => (
                    <OwnedRecordsRow key={application.applicationId} application={application} />
                  ))}
                </ul>
              )}
            </section>

            {ownership.data?.degraded && (
              <Alert intent="warning" title="Some counts are missing">
                An app didn’t answer in time, so it may own more than shown. Deletion still transfers everything it holds before it finishes.
              </Alert>
            )}
            {ownership.error && (
              <Alert intent="warning" title="Couldn’t list owned records">
                {botErrorMessage(ownership.error)}
              </Alert>
            )}

            <FormField
              label="Transfer records to"
              required
              error={recipientError}
              helper={recipientError ? undefined : `Only active members of ${organisationName} can receive records.`}
            >
              <Select
                value={recipient}
                onValueChange={setRecipient}
                placeholder={recipients.length === 0 ? 'No eligible members' : 'Choose a member'}
                loading={ownership.isLoading}
                invalid={Boolean(recipientError)}
                aria-label="Member receiving the records"
              >
                {recipients.map(recipient => (
                  <Select.Item key={recipient.userId} value={recipient.userId} description={recipient.displayName ? recipient.email : undefined}>
                    {recipient.displayName ?? recipient.email ?? `User ${recipient.userId}`}
                  </Select.Item>
                ))}
              </Select>
            </FormField>

            <p className={styles.note}>The bot is suspended straight away. Deletion finishes once every app confirms the transfer, usually within a few minutes.</p>

            <FormField label={`Type ${bot.handle} to confirm`}>
              <Input value={confirmation} onValueChange={setConfirmation} autoComplete="off" spellCheck={false} />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="danger" loading={remove.isPending} disabled={!ready} onClick={submit}>
            Transfer records and delete
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
