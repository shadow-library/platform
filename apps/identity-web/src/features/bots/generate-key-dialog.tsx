import { useState } from 'react';
import { addDays, Button, DatePicker, Dialog, FormField, Input, parseISODate, SegmentedControl, toast, toISODate } from '@shadow-library/ui';

import { useCreateBotKeyMutation } from '@/lib/apis';
import { botErrorMessage, botFieldError } from '@/lib/bot-errors';
import { customExpiry, MAX_KEY_LIFETIME_DAYS, presetExpiry } from '@/lib/bot-key-expiry';
import { formatDate } from '@/lib/format';
import styles from './bots.module.css';

type ExpiryOption = '30' | '90' | '180' | '365' | 'custom';

const EXPIRY_LABEL: Record<ExpiryOption, string> = { '30': '30 days', '90': '90 days', '180': '180 days', '365': '1 year', custom: 'Custom date' };
interface GenerateKeyDialogProps {
  orgId: string;
  botId: string;
  botLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  require: (action: () => void) => void;
  onGenerated: (key: string, name: string, expiresAt: string) => void;
}

export function GenerateKeyDialog({ orgId, botId, botLabel, open, onOpenChange, require, onGenerated }: GenerateKeyDialogProps): React.JSX.Element {
  const create = useCreateBotKeyMutation(orgId);
  const [name, setName] = useState('');
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>('90');
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [expiryError, setExpiryError] = useState<string | undefined>();

  const today = new Date();
  const minDate = toISODate(addDays(today, 1));
  const maxDate = toISODate(addDays(today, MAX_KEY_LIFETIME_DAYS - 1));
  const customParsed = expiryOption === 'custom' && customDate ? parseISODate(customDate) : null;
  const resolvedDate = expiryOption === 'custom' ? (customParsed ? customExpiry(customParsed, today) : null) : presetExpiry(Number(expiryOption), today);

  const reset = (): void => {
    setName('');
    setExpiryOption('90');
    setCustomDate(null);
    setNameError(undefined);
    setExpiryError(undefined);
  };

  const submit = (): void => {
    setNameError(undefined);
    setExpiryError(undefined);
    const keyName = name.trim();
    if (!keyName) {
      setNameError('Name this key.');
      return;
    }
    if (!resolvedDate) {
      setExpiryError('Pick an expiry date.');
      return;
    }
    require(() =>
      create.mutate(
        { botId, body: { name: keyName, expiresAt: resolvedDate.toISOString() } },
        {
          onSuccess: result => {
            toast.success('Key generated');
            onOpenChange(false);
            reset();
            onGenerated(result.key, result.name, result.expiresAt);
            create.reset();
          },
          onError: error => {
            const fieldError = botFieldError(error);
            if (fieldError?.field === 'expiresAt') setExpiryError(fieldError.message);
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
        <Dialog.Header title="Generate API key" description={`For ${botLabel}. You’ll see the key once, right after you generate it.`} />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Key name" required error={nameError} helper={nameError ? undefined : 'Name it after where the key will live.'}>
              <Input value={name} onValueChange={setName} placeholder="github-actions-release" autoFocus />
            </FormField>
            <FormField
              label="Expires after"
              error={expiryError}
              helper={expiryError ? undefined : resolvedDate ? `Expires on ${formatDate(resolvedDate.toISOString())}.` : undefined}
            >
              <SegmentedControl value={expiryOption} onValueChange={value => setExpiryOption(value as ExpiryOption)} aria-label="Key expiry">
                {(Object.keys(EXPIRY_LABEL) as ExpiryOption[]).map(option => (
                  <SegmentedControl.Item key={option} value={option}>
                    {EXPIRY_LABEL[option]}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl>
              {expiryOption === 'custom' && (
                <div className={styles.customDateWrap}>
                  <DatePicker value={customDate} onValueChange={setCustomDate} min={minDate} max={maxDate} />
                </div>
              )}
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Generate key
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
