import { createFileRoute } from '@tanstack/react-router';
import { Avatar, Switch, Table, toast } from '@shadow-library/ui';

import { QueryState, SectionCard, StatusChip } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import {
  type AppAccessMode,
  type ApplicationVisibility,
  myOrganisationsQueryOptions,
  orgAccessOf,
  type OrganisationApplicationItem,
  orgApplicationsQueryOptions,
  useAssignOrgApplicationMutation,
  useOrgAccess,
  useOrgApplicationsQuery,
  useRootDomain,
  useSetAppAccessModeMutation,
  useUnassignOrgApplicationMutation,
} from '@/lib/apis';

import styles from './applications.module.css';

const VISIBILITY: Record<ApplicationVisibility, { label: string; intent: 'success' | 'warning' | 'info' }> = {
  PUBLIC: { label: 'Public', intent: 'success' },
  RESTRICTED: { label: 'Restricted', intent: 'warning' },
  INTERNAL: { label: 'Internal', intent: 'info' },
};

/** Reading the list needs org-ADMIN; assigning needs ADMIN + step-up, and the mode toggle OWNER + step-up. */
export const Route = createFileRoute('/_portal/organizations/$orgId/applications')({
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    if (orgAccessOf(mine, params.orgId).canManage) await context.queryClient.ensureQueryData(orgApplicationsQueryOptions(params.orgId));
  },
  component: OrgApplicationsPage,
});

function OrgApplicationsPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const { org, canManage } = useOrgAccess(orgId);
  const isOwner = org?.role === 'OWNER';
  const apps = useOrgApplicationsQuery(orgId, canManage);
  const setMode = useSetAppAccessModeMutation(orgId);
  const assign = useAssignOrgApplicationMutation(orgId);
  const unassign = useUnassignOrgApplicationMutation(orgId);
  const rootDomain = useRootDomain();
  const { require, dialog } = useStepUpGate();

  const data = apps.data;
  const mode = data?.appAccessMode ?? 'ALL_APPS';
  const managed = mode === 'ASSIGNED_ONLY';
  const list = data?.applications ?? [];

  if (!canManage)
    return (
      <p className={styles.intro}>
        {org?.type === 'PERSONAL' ? 'Applications aren’t managed for personal workspaces.' : 'Applications are managed by the organization’s owners and admins.'}
      </p>
    );

  const changeMode = (next: AppAccessMode): void => {
    if (next === mode) return;
    require(() => setMode.mutate(next, { onSuccess: () => toast.success('Access mode updated'), onError: error => toast.danger(error.message) }));
  };

  const toggleApp = (app: OrganisationApplicationItem, assigned: boolean): void => {
    const run = (assigned ? assign : unassign).mutate;
    require(() =>
      run(String(app.id), {
        onSuccess: () => toast.success(`${app.displayName ?? app.name} ${assigned ? 'assigned' : 'unassigned'}`),
        onError: error => toast.danger(error.message),
      }),
    );
  };

  const mutating = assign.isPending || unassign.isPending;

  return (
    <div className={styles.page}>
      <SectionCard title="Access mode" description="Choose whether members automatically get every available application, or only the ones you assign.">
        <div className={styles.modeRow}>
          <div className={styles.modeText}>
            <div className={styles.modeLabel}>{managed ? 'Managed — assigned apps only' : 'Open — all available apps'}</div>
            <div className={styles.modeHelp}>
              {managed ? 'Members only get the applications you assign below.' : 'Members get every application available to this organization.'}
            </div>
          </div>
          <Switch
            aria-label="Managed access"
            checked={managed}
            disabled={!isOwner || setMode.isPending}
            onCheckedChange={value => changeMode(value === true ? 'ASSIGNED_ONLY' : 'ALL_APPS')}
          />
        </div>
        {!isOwner && <p className={styles.note}>Only the organization’s owner can change the access mode.</p>}
      </SectionCard>

      <QueryState
        isLoading={apps.isLoading}
        error={apps.error}
        isEmpty={list.length === 0}
        emptyTitle="No applications available"
        emptyDescription="No applications are available to this organization yet."
      >
        <Table
          data={list}
          rowKey="id"
          aria-label="Available applications"
          columns={[
            {
              id: 'app',
              header: 'Application',
              cell: app => (
                <div className={styles.appCell}>
                  <Avatar name={app.displayName ?? app.name} shape="square" size="sm" />
                  <div className={styles.appMain}>
                    <div className={styles.appName}>{app.displayName ?? app.name}</div>
                    <div className={styles.appSub}>
                      {app.subDomain}.{rootDomain}
                    </div>
                  </div>
                </div>
              ),
            },
            { id: 'visibility', header: 'Visibility', cell: app => <StatusChip intent={VISIBILITY[app.visibility].intent}>{VISIBILITY[app.visibility].label}</StatusChip> },
            {
              id: 'access',
              header: managed ? 'Assigned' : 'Access',
              align: 'end',
              cell: app =>
                managed ? (
                  <Switch
                    aria-label={`Toggle ${app.displayName ?? app.name}`}
                    checked={app.assigned}
                    disabled={mutating}
                    onCheckedChange={value => toggleApp(app, value === true)}
                  />
                ) : (
                  <span className={styles.muted}>All members</span>
                ),
            },
          ]}
        />
      </QueryState>
      {dialog}
    </div>
  );
}
