/**
 * Importing npm packages
 */
import { Avatar, Button, DescriptionList, Dialog, FormField, Input, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { EditIcon } from '@/components/icons';
import { PageHeader, QueryState } from '@/components/si';
import { useMeQuery, useUpdateProfileMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import styles from './profile.module.css';

export const Route = createFileRoute('/_portal/account/profile')({
  component: ProfilePage,
});

function ProfilePage(): React.JSX.Element {
  const me = useMeQuery();
  const update = useUpdateProfileMutation();
  const user = me.data;

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const openEdit = (): void => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setEditing(true);
  };

  const submit = (): void => {
    if (!firstName.trim()) return;
    update.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Profile updated');
          setEditing(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Profile"
        subtitle="Your name and account identifiers. This is how you appear across Shadow apps."
        actions={
          user && (
            <Button variant="secondary" prefix={<EditIcon size={15} />} onClick={openEdit}>
              Edit profile
            </Button>
          )
        }
      />

      <QueryState isLoading={me.isLoading} error={me.error}>
        <div className={styles.wrap}>
          <div className={styles.hero}>
            <Avatar name={user ? displayName(user) : ''} size="xl" />
            <div>
              <div className={styles.heroName}>{user ? displayName(user) : '—'}</div>
              <div className={styles.heroMeta}>{user?.email}</div>
            </div>
          </div>

          <div className={styles.card}>
            <DescriptionList layout="row" termWidth={160}>
              <DescriptionList.Item term="First name">{user?.firstName || '—'}</DescriptionList.Item>
              <DescriptionList.Item term="Last name">{user?.lastName || '—'}</DescriptionList.Item>
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

      <Dialog open={editing} onOpenChange={setEditing}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Edit profile" description="Update the name shown across Shadow apps." />
          <Dialog.Body>
            <div className={styles.form}>
              <FormField label="First name" required>
                <Input value={firstName} onValueChange={setFirstName} placeholder="Ada" autoFocus />
              </FormField>
              <FormField label="Last name">
                <Input value={lastName} onValueChange={setLastName} placeholder="Lovelace" />
              </FormField>
            </div>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={update.isPending} onClick={submit}>
              Save changes
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
