/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, Input, OtpInput, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PlusIcon } from '@/components/icons';
import { PageHeader, QueryState, StatusChip } from '@/components/si';
import {
  type ApiError,
  type ContactItem,
  useAddEmailMutation,
  useAddPhoneMutation,
  useEmailsQuery,
  usePhonesQuery,
  useRemoveEmailMutation,
  useRemovePhoneMutation,
  useSetPrimaryEmailMutation,
  useSetPrimaryPhoneMutation,
  useVerifyEmailMutation,
  useVerifyPhoneMutation,
} from '@/lib/apis';

import styles from './contacts.module.css';

export const Route = createFileRoute('/_portal/account/contacts')({
  component: ContactsPage,
});

interface ContactCardProps {
  title: string;
  kind: 'email' | 'phone';
  placeholder: string;
  items: ContactItem[];
  isLoading: boolean;
  error: ApiError | null;
  addPending: boolean;
  verifyPending: boolean;
  onAdd: (value: string) => Promise<string>;
  onVerify: (verificationId: string, code: string) => void;
  onPrimary: (value: string) => void;
  onRemove: (value: string) => void;
}

function ContactCard({ title, kind, placeholder, items, isLoading, error, addPending, verifyPending, onAdd, onVerify, onPrimary, onRemove }: ContactCardProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [code, setCode] = useState('');

  const begin = async (target: string): Promise<void> => {
    if (!target.trim()) return;
    try {
      const id = await onAdd(target.trim());
      setPendingValue(target.trim());
      setVerifyId(id);
      setCode('');
    } catch (cause) {
      toast.danger((cause as ApiError).message);
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
      </div>

      <QueryState isLoading={isLoading} error={error} isEmpty={items.length === 0} emptyTitle={`No ${kind === 'email' ? 'email addresses' : 'phone numbers'} yet`}>
        <div className={styles.rows}>
          {items.map(item => (
            <div key={item.value} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowValue}>{item.value}</span>
                <div className={styles.rowBadges}>
                  {item.isPrimary && <StatusChip intent="accent">Primary</StatusChip>}
                  {item.verifiedAt ? (
                    <StatusChip intent="success" dot>
                      Verified
                    </StatusChip>
                  ) : (
                    <StatusChip intent="warning" dot>
                      Unverified
                    </StatusChip>
                  )}
                </div>
              </div>
              <div className={styles.rowActions}>
                {!item.verifiedAt && (
                  <Button variant="ghost" size="sm" onClick={() => void begin(item.value)}>
                    Verify
                  </Button>
                )}
                {item.verifiedAt && !item.isPrimary && (
                  <Button variant="ghost" size="sm" onClick={() => onPrimary(item.value)}>
                    Make primary
                  </Button>
                )}
                {!item.isPrimary && (
                  <Button variant="ghost" size="sm" onClick={() => onRemove(item.value)}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </QueryState>

      <div className={styles.addRow}>
        <Input
          type={kind === 'email' ? 'email' : 'tel'}
          placeholder={placeholder}
          value={value}
          onValueChange={setValue}
          onKeyDown={event => event.key === 'Enter' && begin(value).then(() => setValue(''))}
        />
        <Button variant="secondary" prefix={<PlusIcon size={15} />} loading={addPending} onClick={() => begin(value).then(() => setValue(''))}>
          Add
        </Button>
      </div>

      <Dialog open={verifyId !== null} onOpenChange={next => !next && setVerifyId(null)}>
        <Dialog.Content size="sm">
          <Dialog.Header title={`Verify ${kind === 'email' ? 'email' : 'phone'}`} description={`Enter the 6-digit code we sent to ${pendingValue}.`} />
          <Dialog.Body>
            <FormField label="Verification code">
              <OtpInput length={6} value={code} onValueChange={setCode} onComplete={entered => verifyId && onVerify(verifyId, entered)} autoFocus />
            </FormField>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="secondary" fullWidth>
                Cancel
              </Button>
            </Dialog.Close>
            <Button variant="primary" fullWidth loading={verifyPending} onClick={() => verifyId && onVerify(verifyId, code)}>
              Verify
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </section>
  );
}

function EmailsSection(): React.JSX.Element {
  const query = useEmailsQuery();
  const add = useAddEmailMutation();
  const verify = useVerifyEmailMutation();
  const primary = useSetPrimaryEmailMutation();
  const remove = useRemoveEmailMutation();
  return (
    <ContactCard
      title="Email addresses"
      kind="email"
      placeholder="you@company.com"
      items={query.data?.items ?? []}
      isLoading={query.isLoading}
      error={query.error}
      addPending={add.isPending}
      verifyPending={verify.isPending}
      onAdd={value => add.mutateAsync(value).then(result => result.verificationId)}
      onVerify={(verificationId, code) =>
        verify.mutate({ verificationId, code }, { onSuccess: () => toast.success('Email verified'), onError: error => toast.danger(error.message) })
      }
      onPrimary={value => primary.mutate(value, { onSuccess: () => toast.success('Primary email updated'), onError: error => toast.danger(error.message) })}
      onRemove={value => remove.mutate(value, { onSuccess: () => toast.success('Email removed'), onError: error => toast.danger(error.message) })}
    />
  );
}

function PhonesSection(): React.JSX.Element {
  const query = usePhonesQuery();
  const add = useAddPhoneMutation();
  const verify = useVerifyPhoneMutation();
  const primary = useSetPrimaryPhoneMutation();
  const remove = useRemovePhoneMutation();
  return (
    <ContactCard
      title="Phone numbers"
      kind="phone"
      placeholder="+15551234567"
      items={query.data?.items ?? []}
      isLoading={query.isLoading}
      error={query.error}
      addPending={add.isPending}
      verifyPending={verify.isPending}
      onAdd={value => add.mutateAsync(value).then(result => result.verificationId)}
      onVerify={(verificationId, code) =>
        verify.mutate({ verificationId, code }, { onSuccess: () => toast.success('Phone verified'), onError: error => toast.danger(error.message) })
      }
      onPrimary={value => primary.mutate(value, { onSuccess: () => toast.success('Primary phone updated'), onError: error => toast.danger(error.message) })}
      onRemove={value => remove.mutate(value, { onSuccess: () => toast.success('Phone removed'), onError: error => toast.danger(error.message) })}
    />
  );
}

function ContactsPage(): React.JSX.Element {
  return (
    <div className={styles.page}>
      <PageHeader title="Emails & phones" subtitle="Manage the addresses you use to sign in, recover access, and receive notifications." />
      <EmailsSection />
      <PhonesSection />
      <p className={styles.note}>Unverified addresses expire after 7 days. The primary address can’t be removed — set another as primary first.</p>
    </div>
  );
}
