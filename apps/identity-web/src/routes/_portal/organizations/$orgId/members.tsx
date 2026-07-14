/**
 * Importing npm packages
 */
import { Avatar, Badge, Button, Dialog, DropdownMenu, FormField, IconButton, Input, Select, Table, TokenInput, type TokenValue, toast } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { MailIcon, MoreIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { QueryState } from '@/components/si';
import {
  type InvitableRole,
  type MemberItem,
  type MemberRole,
  invitationsQueryOptions,
  membersQueryOptions,
  useInvitationsQuery,
  useInviteMemberMutation,
  useMeQuery,
  useMembersQuery,
  useRemoveMemberMutation,
  useRevokeInvitationMutation,
  useUpdateMemberRoleMutation,
} from '@/lib/apis';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './members.module.css';

export const Route = createFileRoute('/_portal/organizations/$orgId/members')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(membersQueryOptions(params.orgId)), context.queryClient.ensureQueryData(invitationsQueryOptions(params.orgId))]),
  component: MembersPage,
});

const ROLE_LABEL = (role: MemberRole): string => role[0] + role.slice(1).toLowerCase();

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
  const me = useMeQuery();
  const members = useMembersQuery(orgId);
  const invitations = useInvitationsQuery(orgId);
  const updateRole = useUpdateMemberRoleMutation(orgId);
  const removeMember = useRemoveMemberMutation(orgId);
  const invite = useInviteMemberMutation(orgId);
  const revoke = useRevokeInvitationMutation(orgId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [inviteOpen, setInviteOpen] = useState(false);

  const rows = (members.data?.members ?? []).filter(member => {
    if (roleFilter !== 'all' && member.role !== roleFilter) return false;
    if (search && !(member.email ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pending = invitations.data?.invitations ?? [];

  const changeRole = (member: MemberItem, role: MemberRole): void =>
    updateRole.mutate({ userId: member.userId, role }, { onSuccess: () => toast.success('Role updated'), onError: error => toast.danger(error.message) });

  const remove = (member: MemberItem): void =>
    removeMember.mutate(member.userId, { onSuccess: () => toast.success('Member removed'), onError: error => toast.danger(error.message) });

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input size="sm" placeholder="Search members…" prefix={<SearchIcon size={15} />} value={search} onValueChange={setSearch} />
        </div>
        <Select size="sm" value={roleFilter} onValueChange={setRoleFilter}>
          <Select.Item value="all">All roles</Select.Item>
          <Select.Item value="OWNER">Owner</Select.Item>
          <Select.Item value="ADMIN">Admin</Select.Item>
          <Select.Item value="MEMBER">Member</Select.Item>
        </Select>
        <div className={styles.spacer} />
        <Button variant="primary" size="sm" prefix={<PlusIcon size={15} />} onClick={() => setInviteOpen(true)}>
          Invite members
        </Button>
      </div>

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
            { id: 'joined', header: 'Joined', cell: member => <span className={styles.muted}>{formatDate(member.joinedAt)}</span> },
            {
              id: 'actions',
              header: '',
              align: 'end',
              width: 56,
              cell: member =>
                member.userId === me.data?.userId ? null : (
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
                      <DropdownMenu.Item destructive onSelect={() => remove(member)}>
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
                  onClick={() =>
                    invitation.role !== 'OWNER' &&
                    invite.mutate({ email: invitation.email, role: invitation.role as InvitableRole }, { onSuccess: () => toast.success('Invitation resent') })
                  }
                >
                  Resend
                </Button>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(invitation.id, { onSuccess: () => toast.success('Invitation revoked') })}>
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <InviteDialog orgId={orgId} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
