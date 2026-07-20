/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Avatar, Button, DescriptionList, FormField, Input, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PageHeader, QueryState } from '@/components/si';
import { useMeQuery, useUpdateProfileMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import styles from './profile.module.css';

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/_portal/account/profile')({
  component: ProfilePage,
});

function ProfilePage(): React.JSX.Element {
  const me = useMeQuery();
  const update = useUpdateProfileMutation();
  const user = me.data;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seed the inline form once the warm session lands; the form then owns its state until save/cancel.
  useEffect(() => {
    if (!user || seeded) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setSeeded(true);
  }, [user, seeded]);

  const dirty = Boolean(user) && (firstName !== (user?.firstName ?? '') || lastName !== (user?.lastName ?? ''));

  const reset = (): void => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  };

  const submit = (): void => {
    if (!firstName.trim()) {
      toast.danger('First name is required.');
      return;
    }
    update.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim() || undefined },
      {
        onSuccess: () => toast.success('Profile saved'),
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <div className={styles.page}>
      <PageHeader title="Profile" subtitle="This information is shown to apps you connect and to your organizations." />

      <QueryState isLoading={me.isLoading} error={me.error}>
        <div className={styles.wrap}>
          <div className={styles.hero}>
            <Avatar name={user ? displayName(user) : ''} size="xl" />
            <div>
              <div className={styles.heroName}>{user ? displayName(user) : '—'}</div>
              <div className={styles.heroMeta}>{user?.email}</div>
            </div>
          </div>

          <div className={styles.formCard}>
            <div className={styles.grid}>
              <FormField label="First name" required>
                <Input value={firstName} onValueChange={setFirstName} placeholder="Ada" />
              </FormField>
              <FormField label="Last name">
                <Input value={lastName} onValueChange={setLastName} placeholder="Lovelace" />
              </FormField>
            </div>
            <div className={styles.actions} style={{ marginTop: 18 }}>
              <Button variant="ghost" disabled={!dirty || update.isPending} onClick={reset}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!dirty} loading={update.isPending} onClick={submit}>
                Save changes
              </Button>
            </div>
          </div>

          <div className={styles.card}>
            <div style={{ paddingTop: 14 }}>
              <div className={styles.sectionLabel}>Account</div>
            </div>
            <DescriptionList layout="row" termWidth={160}>
              <DescriptionList.Item term="Primary email">{user?.email || '—'}</DescriptionList.Item>
              <DescriptionList.Item term="Two-factor">{user?.aal === 'AAL2' || user?.elevated ? 'Enabled · AAL2' : 'Not enabled · AAL1'}</DescriptionList.Item>
              <DescriptionList.Item term="User ID" mono copyable>
                {user?.userId}
              </DescriptionList.Item>
            </DescriptionList>
          </div>

          <p className={styles.note}>To change your email or phone, use Emails &amp; phones.</p>
        </div>
      </QueryState>
    </div>
  );
}
