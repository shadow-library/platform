import { type MyOrganisation } from '@/lib/apis';

export interface OrgGates {
  invitations: boolean;
  applications: boolean;
  bots: boolean;
  domains: boolean;
  providers: boolean;
  security: boolean;
  checklist: boolean;
}

export function orgGates(org: MyOrganisation | null, canManage: boolean): OrgGates {
  const isTeam = org?.type === 'TEAM';
  return {
    invitations: canManage,
    applications: canManage,
    bots: isTeam && canManage,
    domains: isTeam,
    providers: canManage,
    security: canManage,
    checklist: isTeam && canManage,
  };
}
