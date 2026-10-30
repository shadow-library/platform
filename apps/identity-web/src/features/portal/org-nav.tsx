import { type NavConfig } from '@shadow-library/ui/router';

import { ArrowLeftIcon, BotIcon, BuildingIcon, GlobeIcon, GridIcon, KeyRoundIcon, LayersIcon, ShieldCheckIcon, SlidersIcon, UsersIcon } from '@/components/icons';
import { type MemberRole, type MyOrganisation } from '@/lib/apis';

export const ORG_OVERVIEW_PATH = '/organizations/$orgId';

export interface OrgNavOptions {
  orgId: string;
  org: MyOrganisation | null;
  canManage: boolean;
  organisations: MyOrganisation[];
  loading: boolean;
  onSelect: (orgId: string) => void;
  onShowAll: () => void;
}

const ROLE_LABEL: Record<MemberRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };
const TYPE_LABEL: Record<MyOrganisation['type'], string> = { TEAM: 'Team', PERSONAL: 'Personal' };

export function orgCaption(org: MyOrganisation): string {
  return `${ROLE_LABEL[org.role]} · ${TYPE_LABEL[org.type]}`;
}

function switcherOption(org: MyOrganisation): { id: string; label: string; caption: string } {
  return { id: org.id, label: org.name, caption: orgCaption(org) };
}

export function orgNavConfig({ orgId, org, canManage, organisations, loading, onSelect, onShowAll }: OrgNavOptions): NavConfig {
  const params = { orgId };
  const isTeam = org?.type === 'TEAM';
  return {
    variant: 'project',
    project: {
      current: org == null ? undefined : switcherOption(org),
      options: organisations.map(switcherOption),
      emptyLabel: 'Organization',
      menuLabel: 'Switch organization',
      loading,
      onSelect,
      footerAction: { label: 'All organizations', icon: <BuildingIcon size={16} />, onSelect: onShowAll },
    },
    sections: [
      {
        label: 'Organization',
        items: [
          { to: ORG_OVERVIEW_PATH, params, label: 'Overview', icon: <GridIcon size={18} />, exact: true },
          { to: '/organizations/$orgId/members', params, label: 'Members', icon: <UsersIcon size={18} /> },
          { to: '/organizations/$orgId/applications', params, label: 'Applications', icon: <LayersIcon size={18} />, hidden: !canManage },
          { to: '/organizations/$orgId/bots', params, label: 'Bots', icon: <BotIcon size={18} />, hidden: !isTeam || !canManage },
          { to: '/organizations/$orgId/settings', params, label: 'Settings', icon: <SlidersIcon size={18} /> },
        ],
      },
      {
        label: 'Access & security',
        items: [
          { to: '/organizations/$orgId/domains', params, label: 'Domains', icon: <GlobeIcon size={18} />, hidden: !isTeam },
          { to: '/organizations/$orgId/providers', params, label: 'Single sign-on', icon: <KeyRoundIcon size={18} />, hidden: !canManage },
          { to: '/organizations/$orgId/security', params, label: 'Security policies', icon: <ShieldCheckIcon size={18} />, hidden: !canManage },
        ],
      },
      { items: [{ to: '/account', label: 'Back to my account', icon: <ArrowLeftIcon size={18} /> }] },
    ],
  };
}
