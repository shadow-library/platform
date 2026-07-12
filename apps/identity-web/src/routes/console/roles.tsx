/**
 * Importing npm packages
 */
import { Button, Dialog, DropdownMenu, FormField, IconButton, Input, Select, Spinner, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { PlusIcon, ShieldCheckIcon } from '@/components/icons';
import { PageHeader } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { useApplicationQuery, useApplicationsQuery, useCreatePermissionMutation, useCreateRoleMutation, useGrantRolePermissionMutation, usePermissionsQuery } from '@/lib/apis';

import styles from './console.module.css';

export const Route = createFileRoute('/console/roles')({
  component: RolesPage,
});

type CreateKind = 'role' | 'permission' | null;

function RolesPage(): React.JSX.Element {
  const apps = useApplicationsQuery();
  const { require, dialog } = useStepUpGate();
  const [appId, setAppId] = useState('');
  const firstAppId = apps.data?.items[0]?.id;
  // Default to the first application until the operator picks another — derived, so no effect is needed.
  const effectiveAppId = appId || (firstAppId === undefined ? '' : String(firstAppId));

  const app = useApplicationQuery(effectiveAppId, Boolean(effectiveAppId));
  const permissions = usePermissionsQuery(Number(effectiveAppId), Boolean(effectiveAppId));
  const createRole = useCreateRoleMutation();
  const createPermission = useCreatePermissionMutation();
  const grant = useGrantRolePermissionMutation();

  const [creating, setCreating] = useState<CreateKind>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const roles = app.data?.roles ?? [];
  const perms = permissions.data?.items ?? [];

  const submitCreate = (): void => {
    if (!name.trim()) return;
    const applicationId = Number(effectiveAppId);
    if (creating === 'role') {
      createRole.mutate(
        { applicationId, roleName: name.trim(), description: description.trim() || undefined },
        {
          onSuccess: () => {
            toast.success('Role created');
            setCreating(null);
            setName('');
            setDescription('');
          },
          onError: error => toast.danger(error.message),
        },
      );
    } else {
      createPermission.mutate(
        { applicationId, name: name.trim(), description: description.trim() || undefined },
        {
          onSuccess: () => {
            toast.success('Permission created');
            setCreating(null);
            setName('');
            setDescription('');
          },
          onError: error => toast.danger(error.message),
        },
      );
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader title="Roles & permissions" subtitle="Roles and permissions are defined per application; a role only carries its own application’s permissions." />

      <div className={styles.toolbar}>
        <Select placeholder="Select an application" value={effectiveAppId} onValueChange={setAppId}>
          {(apps.data?.items ?? []).map(item => (
            <Select.Item key={item.id} value={String(item.id)}>
              {item.displayName ?? item.name}
            </Select.Item>
          ))}
        </Select>
      </div>

      {!effectiveAppId ? (
        <div style={{ color: 'var(--sh-text-tertiary)', fontSize: 13 }}>Choose an application to manage its roles and permissions.</div>
      ) : app.isLoading ? (
        <Spinner size="lg" />
      ) : (
        <div className={styles.twoCol}>
          <section className={styles.detailCard}>
            <div className={styles.sectionHead}>
              <div className={styles.detailCardTitle}>Roles</div>
              <Button
                variant="secondary"
                size="sm"
                prefix={<PlusIcon size={14} />}
                onClick={() =>
                  require(() => {
                    setCreating('role');
                    setName('');
                    setDescription('');
                  })
                }
              >
                New role
              </Button>
            </div>
            {roles.length === 0 ? (
              <div className={styles.empty}>No roles yet.</div>
            ) : (
              roles.map(role => (
                <div key={role.id} className={styles.accessRow}>
                  <div className={styles.accessMain}>
                    <div className={styles.accessName}>
                      <ShieldCheckIcon size={15} />
                      {role.roleName}
                    </div>
                    {role.description && <div className={styles.accessSub}>{role.description}</div>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenu.Trigger asChild>
                      <IconButton variant="ghost" size="sm" aria-label="Grant permission" icon={<PlusIcon size={15} />} />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Label>Grant permission</DropdownMenu.Label>
                      {perms.length === 0 && <DropdownMenu.Item disabled>No permissions</DropdownMenu.Item>}
                      {perms.map(permission => (
                        <DropdownMenu.Item
                          key={permission.id}
                          onSelect={() =>
                            require(() =>
                              grant.mutate(
                                { roleId: role.id, permissionId: permission.id },
                                { onSuccess: () => toast.success(`Granted ${permission.name}`), onError: error => toast.danger(error.message) },
                              ),
                            )
                          }
                        >
                          {permission.name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </div>
              ))
            )}
          </section>

          <section className={styles.detailCard}>
            <div className={styles.sectionHead}>
              <div className={styles.detailCardTitle}>Permissions</div>
              <Button
                variant="secondary"
                size="sm"
                prefix={<PlusIcon size={14} />}
                onClick={() =>
                  require(() => {
                    setCreating('permission');
                    setName('');
                    setDescription('');
                  })
                }
              >
                New permission
              </Button>
            </div>
            {perms.length === 0 ? (
              <div className={styles.empty}>No permissions yet.</div>
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
        </div>
      )}

      <Dialog open={creating !== null} onOpenChange={open => !open && setCreating(null)}>
        <Dialog.Content size="sm">
          <Dialog.Header title={creating === 'role' ? 'New role' : 'New permission'} />
          <Dialog.Body>
            <div className={styles.form}>
              <FormField label={creating === 'role' ? 'Role name' : 'Permission name'} required>
                <Input value={name} onValueChange={setName} placeholder={creating === 'role' ? 'editor' : 'orders:read'} autoFocus />
              </FormField>
              <FormField label="Description">
                <Input value={description} onValueChange={setDescription} />
              </FormField>
            </div>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" loading={createRole.isPending || createPermission.isPending} onClick={submitCreate}>
              Create
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
      {dialog}
    </div>
  );
}
