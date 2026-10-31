import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, ConfirmDialog, Dialog, DropdownMenu, FormField, IconButton, PlusIcon, Select, Table, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

import { MailIcon, MoreIcon } from '@/components/icons';
import { ListToolbar, PageHeader, QueryState } from '@/components/si';
import {
  type InvitableRole,
  type InvitationItem,
  invitationsQueryOptions,
  type MemberItem,
  type MemberRole,
  membersQueryOptions,
  type MemberStatus,
  myOrganisationsQueryOptions,
  orgAccessOf,
  useInvitationsQuery,
  useInviteMemberMutation,
  useMembersQuery,
  useMeQuery,
  useOrgAccess,
  useRemoveMemberMutation,
  useRevokeInvitationMutation,
  useUpdateMemberRoleMutation,
  useUpdateMemberStatusMutation,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './members.module.css';

interface MembersSearch {
  invite?: true;
}

/** Invitations are an org-admin surface (403 for members, rejected outright for personal workspaces), so only managers prefetch them. */
export const Route = createFileRoute('/_portal/organizations/$orgId/members')({
  validateSearch: (search: Record<string, unknown>): MembersSearch => ({ invite: search.invite === true || search.invite === 'true' ? true : undefined }),
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    const { canManage } = orgAccessOf(mine, params.orgId);
    const queries: Promise<unknown>[] = [context.queryClient.ensureQueryData(membersQueryOptions(params.orgId))];
    if (canManage) queries.push(context.queryClient.ensureQueryData(invitationsQueryOptions(params.orgId)));
    await Promise.all(queries);
  },
  component: MembersPage,
});

const ROLE_LABEL = (role: MemberRole): string => role[0] + role.slice(1).toLowerCase();
const STATUS_LABEL = (status: MemberStatus): string => status[0] + status.slice(1).toLowerCase();

function InviteDialog({ orgId, open, onOpenChange }: { orgId: string; open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const invite = useInviteMemberMutation(orgId);
  const [emails, setEmails] = useState<TokenValue[]>([]);
  const [role, setRole] = useState<InvitableRole>('MEMBER');

  const send = async (): Promise<void> => {
    const valid = emails.filter(token => token.valid).map(token => token.value);
    if (valid.length === 0) return;
    try {
      await Promise.all(valid.map(email => invite.mutateAsync({ email, role })));
      toast.success(`Sent ${valid.length} invitation${valid.length === 1 ? '' : 's'}`);
      onOpenChange(false);
      setEmails([]);
    } catch (cause) {
      toast.danger((cause as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="Invite members" description="They’ll get an email inviting them to join." />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Email addresses" helper="Separate with commas or Enter.">
              <TokenInput
                value={emails}
                onValueChange={setEmails}
                placeholder="name@company.com"
                validate={value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || 'Enter a valid email'}
              />
            </FormField>
            <FormField label="Role">
              <Select value={role} onValueChange={value => setRole(value as InvitableRole)}>
                <Select.Item value="ADMIN" description="Manage members, domains, and settings">
                  Admin
                </Select.Item>
                <Select.Item value="MEMBER" description="Access shared resources">
                  Member
                </Select.Item>
              </Select>
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={invite.isPending} onClick={send}>
            Send invitations
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

function MembersPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const { invite: inviteRequested } = Route.useSearch();
  const navigate = Route.useNavigate();
  const me = useMeQuery();
  const { canManage } = useOrgAccess(orgId);
  const members = useMembersQuery(orgId);
  const invitations = useInvitationsQuery(orgId, canManage);
  const updateRole = useUpdateMemberRoleMutation(orgId);
  const updateStatus = useUpdateMemberStatusMutation(orgId);
  const removeMember = useRemoveMemberMutation(orgId);
  const invite = useInviteMemberMutation(orgId);
  const revoke = useRevokeInvitationMutation(orgId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [inviteOpen, setInviteOpen] = useState(() => inviteRequested === true && canManage);
  const [removeTarget, setRemoveTarget] = useState<MemberItem | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InvitationItem | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  useEffect(() => {
    if (!inviteRequested) return;
    void navigate({ search: prev => ({ ...prev, invite: undefined }), replace: true });
  }, [inviteRequested, navigate]);

  const rows = (members.data?.members ?? []).filter(member => {
    if (roleFilter !== 'all' && member.role !== roleFilter) return false;
    if (search && !(member.email ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pending = invitations.data?.invitations ?? [];

  const changeRole = (member: MemberItem, role: MemberRole): void =>
    updateRole.mutate({ userId: member.userId, role }, { onSuccess: () => toast.success('Role updated'), onError: error => toast.danger(error.message) });

  const confirmRemove = (): Promise<unknown> | undefined =>
    removeTarget ? removeMember.mutateAsync(removeTarget.userId, { onSuccess: () => toast.success('Member removed'), onError: error => toast.danger(error.message) }) : undefined;

  const confirmRevoke = (): Promise<unknown> | undefined =>
    revokeTarget ? revoke.mutateAsync(revokeTarget.id, { onSuccess: () => toast.success('Invitation revoked'), onError: error => toast.danger(error.message) }) : undefined;

  /** Org-scoped only — this pauses the person inside this organization and leaves their Shadow account untouched. */
  const changeStatus = (member: MemberItem, status: MemberStatus): void =>
    updateStatus.mutate(
      { userId: member.userId, status },
      { onSuccess: () => toast.success(status === 'ACTIVE' ? 'Access restored' : `Member ${status.toLowerCase()}`), onError: error => toast.danger(error.message) },
    );

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="People in this organization, their roles and their access."
        actions={
          canManage && (
            <Button variant="primary" prefix={<PlusIcon size={15} />} onClick={() => setInviteOpen(true)}>
              Invite members
            </Button>
          )
        }
      />
      <div className={styles.page}>
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchLabel="Search members"
          searchPlaceholder="Search members…"
          filters={
            <Select size="sm" aria-label="Filter members by role" value={roleFilter} onValueChange={setRoleFilter}>
              <Select.Item value="all">All roles</Select.Item>
              <Select.Item value="OWNER">Owner</Select.Item>
              <Select.Item value="ADMIN">Admin</Select.Item>
              <Select.Item value="MEMBER">Member</Select.Item>
            </Select>
          }
        />

        <QueryState isLoading={members.isLoading} error={members.error} isEmpty={rows.length === 0} emptyTitle="No members match">
          <Table
            data={rows}
            rowKey="userId"
            aria-label="Organization members"
            columns={[
              {
                id: 'member',
                header: 'Member',
                cell: member => (
                  <div className={styles.memberCell}>
                    <Avatar name={member.email ?? member.userId} size="sm" />
                    <div className={styles.memberText}>
                      <div className={styles.memberName}>
                        {member.email ?? member.userId}
                        {member.userId === me.data?.userId && <span className={styles.you}> (you)</span>}
                      </div>
                    </div>
                  </div>
                ),
              },
              { id: 'role', header: 'Role', cell: member => <Badge intent={member.role === 'OWNER' ? 'info' : 'neutral'}>{ROLE_LABEL(member.role)}</Badge> },
              {
                id: 'status',
                header: 'Status',
                cell: member =>
                  member.status === 'ACTIVE' ? (
                    <span className={styles.muted}>Active</span>
                  ) : (
                    <Badge intent={member.status === 'BLOCKED' ? 'danger' : 'warning'} title={member.statusReason}>
                      {STATUS_LABEL(member.status)}
                    </Badge>
                  ),
              },
              { id: 'joined', header: 'Joined', cell: member => <span className={styles.muted}>{formatDate(member.joinedAt)}</span> },
              {
                id: 'actions',
                header: '',
                align: 'end',
                width: 56,
                cell: member =>
                  !canManage || member.userId === me.data?.userId ? null : (
                    <DropdownMenu>
                      <DropdownMenu.Trigger asChild>
                        <IconButton variant="ghost" size="sm" aria-label="Member actions" icon={<MoreIcon size={16} />} />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Label>Change role</DropdownMenu.Label>
                        <DropdownMenu.Item onSelect={() => changeRole(member, 'OWNER')}>Owner</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => changeRole(member, 'ADMIN')}>Admin</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => changeRole(member, 'MEMBER')}>Member</DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Label>Access</DropdownMenu.Label>
                        {member.status === 'ACTIVE' ? (
                          <>
                            <DropdownMenu.Item onSelect={() => changeStatus(member, 'SUSPENDED')}>Suspend from organization</DropdownMenu.Item>
                            <DropdownMenu.Item destructive onSelect={() => changeStatus(member, 'BLOCKED')}>
                              Block from organization
                            </DropdownMenu.Item>
                          </>
                        ) : (
                          <DropdownMenu.Item onSelect={() => changeStatus(member, 'ACTIVE')}>Restore access</DropdownMenu.Item>
                        )}
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          destructive
                          onSelect={() => {
                            setRemoveTarget(member);
                            setRemoveOpen(true);
                          }}
                        >
                          Remove from organization
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  ),
              },
            ]}
          />
        </QueryState>

        {pending.length > 0 && (
          <div className={styles.pending}>
            <div className="si-eyebrow">Pending invitations</div>
            {pending.map(invitation => (
              <div key={invitation.id} className={styles.inviteRow}>
                <span className={styles.inviteIcon}>
                  <MailIcon size={15} />
                </span>
                <div className={styles.inviteMeta}>
                  <div className={styles.inviteEmail}>{invitation.email}</div>
                  <div className={styles.inviteSub}>
                    Invited as {ROLE_LABEL(invitation.role)} · {relativeTime(invitation.createdAt)} · expires {relativeTime(invitation.expiresAt)}
                  </div>
                </div>
                <div className={styles.inviteActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={invite.isPending && invite.variables?.email === invitation.email}
                    onClick={() =>
                      invitation.role !== 'OWNER' &&
                      invite.mutate(
                        { email: invitation.email, role: invitation.role as InvitableRole },
                        { onSuccess: () => toast.success('Invitation resent'), onError: error => toast.danger(error.message) },
                      )
                    }
                  >
                    Resend
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRevokeTarget(invitation);
                      setRevokeOpen(true);
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <InviteDialog orgId={orgId} open={inviteOpen} onOpenChange={setInviteOpen} />

        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          intent="danger"
          title={`Remove ${removeTarget?.email ?? 'this member'}?`}
          description="They lose access to this organization and everything shared with it immediately. They can be invited again later."
          confirmLabel="Remove member"
          onConfirm={confirmRemove}
        />
        <ConfirmDialog
          open={revokeOpen}
          onOpenChange={setRevokeOpen}
          intent="danger"
          title={`Revoke the invitation for ${revokeTarget?.email ?? 'this email'}?`}
          description="The invitation link stops working. You can send a new invitation at any time."
          confirmLabel="Revoke invitation"
          onConfirm={confirmRevoke}
        />
      </div>
    </>
  );
}
