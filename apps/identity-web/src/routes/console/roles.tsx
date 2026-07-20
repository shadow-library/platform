/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge, Button, ConfirmDialog, Dialog, FormField, Input, Select, Spinner, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { PlusIcon, ShieldCheckIcon, TerminalIcon, UserIcon } from '@/components/icons';
import { Mono, PageHeader } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  adminApplicationsQueryOptions,
  type ApplicationRoleItem,
  type PrincipalType,
  type RoleAssignmentItem,
  useApplicationQuery,
  useApplicationsQuery,
  useCreateRoleAssignmentMutation,
  usePermissionsQuery,
  useRevokeRoleAssignmentMutation,
  useRoleAssignmentsQuery,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './console.module.css';

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/console/roles')({
  // The application list feeds the picker; permissions and assignments load once an application/role is chosen.
  loader: ({ context }) => context.queryClient.ensureQueryData(adminApplicationsQueryOptions()),
  component: RolesPage,
});

const PRINCIPAL_LABEL: Record<PrincipalType, string> = { USER: 'User', SERVICE_ACCOUNT: 'Service account' };

function AssignDialog({ role, open, onOpenChange }: { role: ApplicationRoleItem; open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const assign = useCreateRoleAssignmentMutation();
  const { require, dialog } = useStepUpGate();
  const [principalType, setPrincipalType] = useState<PrincipalType>('USER');
  const [principalId, setPrincipalId] = useState('');
  const [organisationId, setOrganisationId] = useState('');

  const submit = (): void => {
    if (!principalId.trim() || !organisationId.trim()) {
      toast.danger('Principal ID and organisation ID are required.');
      return;
    }
    require(() =>
      assign.mutate(
        { principalType, principalId: principalId.trim(), roleId: role.id, organisationId: organisationId.trim() },
        {
          onSuccess: () => {
            toast.success('Role assigned');
            setPrincipalId('');
            setOrganisationId('');
            onOpenChange(false);
          },
          onError: error => toast.danger(error.message),
        },
      ),
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <Dialog.Content size="sm">
          <Dialog.Header title={`Assign ${role.roleName}`} description="Grant this role to a user or service account within an organisation." />
          <Dialog.Body>
            <div className={styles.form}>
              <FormField label="Principal type" required>
                <Select value={principalType} onValueChange={value => setPrincipalType(value as PrincipalType)}>
                  <Select.Item value="USER">User</Select.Item>
                  <Select.Item value="SERVICE_ACCOUNT">Service account</Select.Item>
                </Select>
              </FormField>
              <FormField label="Principal ID" required helper="The user or service-account identifier.">
                <Input value={principalId} onValueChange={setPrincipalId} placeholder="e.g. 481723…" autoFocus />
              </FormField>
              <FormField label="Organisation ID" required helper="The organisation the assignment applies within.">
                <Input value={organisationId} onValueChange={setOrganisationId} placeholder="e.g. 90210…" />
              </FormField>
            </div>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={assign.isPending} onClick={submit}>
              Assign role
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
      {dialog}
    </>
  );
}

function AssignmentsPanel({ role }: { role: ApplicationRoleItem }): React.JSX.Element {
  const assignments = useRoleAssignmentsQuery({ roleId: role.id });
  const revoke = useRevokeRoleAssignmentMutation();
  const { require, dialog } = useStepUpGate();
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<RoleAssignmentItem | null>(null);

  const items = assignments.data?.items ?? [];

  const confirmRevoke = (): void => {
    if (!pendingRevoke) return;
    const target = pendingRevoke;
    require(() =>
      revoke.mutate(
        { principalType: target.principalType, principalId: target.principalId, roleId: target.roleId, organisationId: target.organisationId },
        {
          onSuccess: () => {
            toast.success('Assignment revoked');
            setPendingRevoke(null);
          },
          onError: error => toast.danger(error.message),
        },
      ),
    );
  };

  return (
    <section className={styles.detailCard}>
      <div className={styles.sectionHead}>
        <div className={styles.detailCardTitle}>Assignments · {role.roleName}</div>
        <Button variant="secondary" size="sm" prefix={<PlusIcon size={15} />} onClick={() => setAssignOpen(true)}>
          Assign
        </Button>
      </div>

      {assignments.isLoading ? (
        <Spinner size="sm" />
      ) : items.length === 0 ? (
        <div className={styles.empty}>No principals hold this role yet.</div>
      ) : (
        items.map(item => (
          <div key={item.id} className={styles.accessRow}>
            <div className={styles.accessMain}>
              <div className={styles.accessName}>
                {item.principalType === 'USER' ? <UserIcon size={15} /> : <TerminalIcon size={15} />}
                <Mono>{item.principalId}</Mono>
                <Badge variant="outline">{PRINCIPAL_LABEL[item.principalType]}</Badge>
              </div>
              <div className={styles.accessSub}>
                Org {item.organisationId} · granted {relativeTime(item.grantedAt)}
                {item.grantedBy ? ` by ${item.grantedBy}` : ''}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPendingRevoke(item)}>
              Revoke
            </Button>
          </div>
        ))
      )}

      <AssignDialog role={role} open={assignOpen} onOpenChange={setAssignOpen} />
      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={open => !open && setPendingRevoke(null)}
        intent="danger"
        title="Revoke assignment?"
        description={
          pendingRevoke
            ? `${PRINCIPAL_LABEL[pendingRevoke.principalType]} ${pendingRevoke.principalId} will lose the ${role.roleName} role in organisation ${pendingRevoke.organisationId}.`
            : ''
        }
        confirmLabel="Revoke"
        loading={revoke.isPending}
        onConfirm={confirmRevoke}
      />
      {dialog}
    </section>
  );
}

function RolesPage(): React.JSX.Element {
  const apps = useApplicationsQuery();
  const [appId, setAppId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const firstAppId = apps.data?.items[0]?.id;
  // Default to the first application until the operator picks another — derived, so no effect is needed.
  const effectiveAppId = appId || (firstAppId === undefined ? '' : String(firstAppId));

  const app = useApplicationQuery(effectiveAppId, Boolean(effectiveAppId));
  const permissions = usePermissionsQuery(Number(effectiveAppId), Boolean(effectiveAppId));

  const roles = app.data?.roles ?? [];
  const perms = permissions.data?.items ?? [];
  // Selection survives only while the chosen role still belongs to the current application.
  const selectedRole = roles.find(role => role.id === selectedRoleId) ?? null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Roles & permissions"
        subtitle="Roles and permissions are defined by each application and synced through the platform catalog. Here you assign those roles to users and service accounts."
      />

      <div className={styles.toolbar}>
        <Select
          placeholder="Select an application"
          value={effectiveAppId}
          onValueChange={value => {
            setAppId(value);
            setSelectedRoleId(null);
          }}
        >
          {(apps.data?.items ?? []).map(item => (
            <Select.Item key={item.id} value={String(item.id)}>
              {item.displayName ?? item.name}
            </Select.Item>
          ))}
        </Select>
      </div>

      {!effectiveAppId ? (
        <div style={{ color: 'var(--sh-text-tertiary)', fontSize: 13 }}>Choose an application to view its roles and permissions.</div>
      ) : app.isLoading ? (
        <Spinner size="lg" />
      ) : (
        <>
          <div className={styles.twoCol}>
            <section className={styles.detailCard}>
              <div className={styles.sectionHead}>
                <div className={styles.detailCardTitle}>Roles</div>
              </div>
              {roles.length === 0 ? (
                <div className={styles.empty}>This application has not published any roles.</div>
              ) : (
                roles.map(role => (
                  <button
                    key={role.id}
                    type="button"
                    className={styles.accessRow}
                    onClick={() => setSelectedRoleId(role.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      font: 'inherit',
                      background: role.id === selectedRoleId ? 'var(--sh-surface-well)' : 'transparent',
                      borderColor: role.id === selectedRoleId ? 'var(--sh-accent)' : undefined,
                    }}
                  >
                    <div className={styles.accessMain}>
                      <div className={styles.accessName}>
                        <ShieldCheckIcon size={15} />
                        {role.roleName}
                      </div>
                      {role.description && <div className={styles.accessSub}>{role.description}</div>}
                    </div>
                  </button>
                ))
              )}
            </section>

            {selectedRole ? (
              <AssignmentsPanel role={selectedRole} />
            ) : (
              <section className={styles.detailCard}>
                <div className={styles.sectionHead}>
                  <div className={styles.detailCardTitle}>Assignments</div>
                </div>
                <div className={styles.empty}>Select a role to view and manage its assignments.</div>
              </section>
            )}
          </div>

          <section className={styles.detailCard}>
            <div className={styles.sectionHead}>
              <div className={styles.detailCardTitle}>Permissions</div>
            </div>
            {perms.length === 0 ? (
              <div className={styles.empty}>This application has not published any permissions.</div>
            ) : (
              perms.map(permission => (
                <div key={permission.id} className={styles.accessRow}>
                  <div className={styles.accessMain}>
                    <div className={styles.accessName}>{permission.name}</div>
                    {permission.description && <div className={styles.accessSub}>{permission.description}</div>}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
