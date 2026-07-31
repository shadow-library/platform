/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ConfirmDialog, DescriptionList, FormField, Input, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { SectionCard } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { myOrganisationsQueryOptions, useDeleteOrganisationMutation, useMyOrganisationsQuery, useRenameOrganisationMutation } from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './settings.module.css';

export const Route = createFileRoute('/_portal/organizations/$orgId/settings')({
  loader: ({ context }) => context.queryClient.ensureQueryData(myOrganisationsQueryOptions()),
  component: SettingsPage,
});

function SettingsPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const orgs = useMyOrganisationsQuery();
  const org = orgs.data?.organisations.find(item => item.id === orgId);
  const rename = useRenameOrganisationMutation(orgId);
  const del = useDeleteOrganisationMutation();
  const { require, dialog } = useStepUpGate();

  const [draft, setDraft] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const name = draft ?? org?.name ?? '';

  const isOwner = org?.role === 'OWNER';
  const isPersonal = org?.type === 'PERSONAL';

  return (
    <div className={styles.page}>
      <SectionCard title="General" description="Your organization’s name and identifiers.">
        <div className={styles.form}>
          <FormField label="Organization name">
            <Input value={name} onValueChange={setDraft} disabled={!isOwner && org?.role !== 'ADMIN'} />
          </FormField>
          <div>
            <Button
              variant="primary"
              loading={rename.isPending}
              disabled={!name.trim() || name === org?.name}
              onClick={() => rename.mutate(name.trim(), { onSuccess: () => toast.success('Organization renamed'), onError: error => toast.danger(error.message) })}
            >
              Save changes
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Details">
        <DescriptionList layout="row" termWidth={140}>
          <DescriptionList.Item term="Slug" mono copyable>
            {org?.slug}
          </DescriptionList.Item>
          <DescriptionList.Item term="Type">{org?.type === 'PERSONAL' ? 'Personal' : 'Team'}</DescriptionList.Item>
          <DescriptionList.Item term="Status">{org?.status ? org.status[0] + org.status.slice(1).toLowerCase() : '—'}</DescriptionList.Item>
          <DescriptionList.Item term="Organization ID" mono copyable>
            {orgId}
          </DescriptionList.Item>
          <DescriptionList.Item term="Joined">{org?.joinedAt ? formatDate(org.joinedAt) : '—'}</DescriptionList.Item>
        </DescriptionList>
      </SectionCard>

      {isOwner && !isPersonal && (
        <section className={styles.danger}>
          <div className={styles.dangerMain}>
            <div className={styles.dangerTitle}>Delete organization</div>
            <div className={styles.dangerText}>Permanently delete {org?.name} and revoke every member’s access. This can’t be undone.</div>
          </div>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Delete organization
          </Button>
        </section>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        intent="danger"
        title={`Delete ${org?.name}?`}
        description="Every member loses access immediately and all org-scoped roles are revoked. This cannot be undone."
        confirmLabel="Delete organization"
        typedConfirmation={org?.name}
        loading={del.isPending}
        onConfirm={() =>
          require(() =>
            del.mutate(orgId, {
              onSuccess: () => {
                toast.success('Organization deleted');
                setConfirmOpen(false);
                navigate({ to: '/organizations' });
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
