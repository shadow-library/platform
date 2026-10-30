import { createFileRoute, Link } from '@tanstack/react-router';
import { Avatar, Badge, Button, PlusIcon } from '@shadow-library/ui';

import { PageHeader } from '@/components/si';
import { buildChecklist, buildTiles, OverviewTiles, SecurityChecklist } from '@/features/org-overview';
import { orgGates } from '@/features/portal';
import {
  botsQueryOptions,
  domainsQueryOptions,
  identityProvidersQueryOptions,
  invitationsQueryOptions,
  type MemberRole,
  membersQueryOptions,
  myOrganisationsQueryOptions,
  orgAccessOf,
  organisationPoliciesQueryOptions,
  orgApplicationsQueryOptions,
  useBotsQuery,
  useDomainsQuery,
  useIdentityProvidersQuery,
  useInvitationsQuery,
  useMembersQuery,
  useOrgAccess,
  useOrgApplicationsQuery,
  usePoliciesQuery,
} from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from '@/features/org-overview/org-overview.module.css';

export const Route = createFileRoute('/_portal/organizations/$orgId/')({
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    const { org, canManage } = orgAccessOf(mine, params.orgId);
    const gates = orgGates(org, canManage);
    const { queryClient } = context;
    void queryClient.prefetchQuery(membersQueryOptions(params.orgId));
    if (gates.invitations) void queryClient.prefetchQuery(invitationsQueryOptions(params.orgId));
    if (gates.applications) void queryClient.prefetchQuery(orgApplicationsQueryOptions(params.orgId));
    if (gates.bots) void queryClient.prefetchQuery(botsQueryOptions(params.orgId));
    if (gates.domains) void queryClient.prefetchQuery(domainsQueryOptions(params.orgId));
    if (gates.checklist) {
      void queryClient.prefetchQuery(identityProvidersQueryOptions(params.orgId));
      void queryClient.prefetchQuery(organisationPoliciesQueryOptions(params.orgId));
    }
  },
  component: OrgOverviewPage,
});

const ROLE_LABEL: Record<MemberRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };
const ROLE_INTENT: Record<MemberRole, 'info' | 'neutral'> = { OWNER: 'info', ADMIN: 'neutral', MEMBER: 'neutral' };

function OrgOverviewPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const { org, canManage } = useOrgAccess(orgId);
  const gates = orgGates(org, canManage);

  const members = useMembersQuery(orgId);
  const invitations = useInvitationsQuery(orgId, gates.invitations);
  const applications = useOrgApplicationsQuery(orgId, gates.applications);
  const bots = useBotsQuery(orgId, gates.bots);
  const domains = useDomainsQuery(orgId, gates.domains);
  const providers = useIdentityProvidersQuery(orgId, gates.checklist);
  const policies = usePoliciesQuery(orgId, gates.checklist);

  const tiles = buildTiles(gates, { members, invitations, applications, bots, domains });
  const checklist = buildChecklist({ domains, providers, policies });

  const meta = [org?.slug, org?.type === 'PERSONAL' ? 'Personal workspace' : 'Team workspace', org?.joinedAt ? `Joined ${formatDate(org.joinedAt)}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHeader
        leading={<Avatar name={org?.name ?? 'Organization'} shape="square" size="lg" />}
        title={org?.name ?? 'Organization'}
        tags={org && <Badge intent={ROLE_INTENT[org.role]}>{ROLE_LABEL[org.role]}</Badge>}
        subtitle={org && meta}
        actions={
          gates.invitations && (
            <Button variant="primary" prefix={<PlusIcon size={15} />} asChild>
              <Link to="/organizations/$orgId/members" params={{ orgId }} search={{ invite: true }}>
                Invite members
              </Link>
            </Button>
          )
        }
      />
      <div className={styles.page}>
        <OverviewTiles orgId={orgId} tiles={tiles} />
        {gates.checklist && <SecurityChecklist orgId={orgId} checklist={checklist} />}
      </div>
    </>
  );
}
