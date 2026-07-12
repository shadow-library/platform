/**
 * Importing npm packages
 */
import { Avatar, Badge, Button } from '@shadow-library/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { type MemberRole, useMyOrganisationsQuery } from '@/lib/apis';
import { formatDate } from '@/lib/format';

import styles from './org.module.css';

/**
 * Defining types
 */
interface OrgWorkspaceProps {
  orgId: string;
  children: ReactNode;
}

/**
 * Declaring the constants
 */
const TABS = [
  { to: '/organizations/$orgId/settings', label: 'Settings' },
  { to: '/organizations/$orgId/members', label: 'Members & roles' },
  { to: '/organizations/$orgId/domains', label: 'Domains' },
  { to: '/organizations/$orgId/providers', label: 'Identity providers' },
] as const;

const ROLE_INTENT: Record<MemberRole, 'info' | 'neutral'> = { OWNER: 'info', ADMIN: 'neutral', MEMBER: 'neutral' };

/**
 * The single-organisation workspace: an identity header (name, the caller's role, slug/created meta)
 * over a tab bar for settings, members, domains, and identity providers. Rendered inside the portal
 * shell, so it is a sub-layout rather than its own chrome.
 */
export function OrgWorkspace({ orgId, children }: OrgWorkspaceProps): React.JSX.Element {
  const navigate = useNavigate();
  const orgs = useMyOrganisationsQuery();
  const org = orgs.data?.organisations.find(item => item.id === orgId);
  const role = org?.role ?? 'MEMBER';

  return (
    <div className={styles.workspace}>
      <div className={styles.head}>
        <Avatar name={org?.name ?? 'Organization'} shape="square" size="lg" />
        <div className={styles.headMain}>
          <div className={styles.headTitleRow}>
            <h1 className={styles.headTitle}>{org?.name ?? 'Organization'}</h1>
            <Badge intent={ROLE_INTENT[role]}>{role[0] + role.slice(1).toLowerCase()}</Badge>
          </div>
          <div className={styles.headMeta}>
            {[org?.slug, org?.type === 'PERSONAL' ? 'Personal workspace' : null, org?.joinedAt ? `Joined ${formatDate(org.joinedAt)}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/organizations' })}>
          Switch org
        </Button>
      </div>

      <div className={styles.tabs}>
        {TABS.map(tab => (
          <Link key={tab.to} to={tab.to} params={{ orgId }} className={styles.tab} activeProps={{ 'data-active': 'true' }}>
            {tab.label}
          </Link>
        ))}
      </div>

      <div className={styles.tabBody}>{children}</div>
    </div>
  );
}
