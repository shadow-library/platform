/**
 * Importing npm packages
 */
import { Alert, Avatar, Button } from '@shadow-library/ui';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode } from 'react';

/**
 * Importing user defined modules
 */
import { BuildingIcon, ChevronRightIcon, MailIcon, MonitorIcon, PlugIcon, ShieldCheckIcon, UserIcon } from '@/components/icons';
import { PageHeader, StatusChip } from '@/components/si';
import { useMeQuery, useMfaQuery, useMyApplicationsQuery, useMyOrganisationsQuery, useSessionsQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

import styles from './index.module.css';

export const Route = createFileRoute('/_portal/account/')({
  component: AccountOverview,
});

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hintTone?: 'success' | 'default';
}

function StatTile({ label, value, hint, hintTone = 'default' }: StatTileProps): React.JSX.Element {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {hint && (
        <div className={styles.statHint} data-tone={hintTone}>
          {hint}
        </div>
      )}
    </div>
  );
}

interface NavCardProps {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
}

function NavCard({ to, icon, title, description, cta }: NavCardProps): React.JSX.Element {
  return (
    <Link to={to} className={`si-cardhover ${styles.navCard}`}>
      <div className={styles.navCardHead}>
        <span className={styles.navCardIcon}>{icon}</span>
        <span className={styles.navCardTitle}>{title}</span>
      </div>
      <p className={styles.navCardText}>{description}</p>
      <span className={styles.navCardCta}>
        {cta} <ChevronRightIcon size={14} />
      </span>
    </Link>
  );
}

function AccountOverview(): React.JSX.Element {
  const navigate = useNavigate();
  const me = useMeQuery();
  const mfa = useMfaQuery();
  const sessions = useSessionsQuery();
  const apps = useMyApplicationsQuery();
  const orgs = useMyOrganisationsQuery();
  const signout = useSignoutMutation();

  const user = me.data;
  const enrollments = mfa.data?.enrollments ?? [];
  const passkeys = enrollments.filter(item => item.type === 'WEBAUTHN').length;
  const hasTotp = enrollments.some(item => item.type === 'TOTP');
  const factors = 1 + (hasTotp ? 1 : 0) + passkeys;
  const factorDetail = ['Password', hasTotp ? 'TOTP' : null, passkeys ? `${passkeys} passkey${passkeys === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');

  const sessionList = sessions.data?.sessions ?? [];
  const deviceCount = new Set(sessionList.map(item => item.deviceName ?? item.userAgent ?? item.id)).size;
  const appList = apps.data?.applications ?? [];
  const orgList = orgs.data?.organisations ?? [];
  const owned = orgList.filter(item => item.role === 'OWNER').length;
  const hasPasskey = passkeys > 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Overview"
        subtitle="Manage your identity, security, and the apps connected to your Shadow account."
        actions={
          <Button variant="secondary" loading={signout.isPending} onClick={() => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) })}>
            Sign out
          </Button>
        }
      />

      <div className={styles.profile}>
        <Avatar name={user ? displayName(user) : ''} size="xl" />
        <div className={styles.profileMain}>
          <div className={styles.profileName}>{user ? displayName(user) : '—'}</div>
          <div className={styles.profileMeta}>{user?.email}</div>
        </div>
        <StatusChip intent={user?.aal === 'AAL2' || user?.elevated ? 'success' : 'neutral'} dot>
          {user?.aal === 'AAL2' || user?.elevated ? 'Multi-factor · AAL2' : 'Single factor · AAL1'}
        </StatusChip>
        <Button variant="ghost" asChild>
          <Link to="/account/profile">Edit profile</Link>
        </Button>
      </div>

      {!hasPasskey && (
        <Alert intent="info" title="Strengthen your account" action={{ label: 'Add a passkey', onClick: () => navigate({ to: '/account/security' }) }}>
          Add a passkey for phishing-resistant sign-in that works across your devices.
        </Alert>
      )}

      <div className={styles.statGrid}>
        <StatTile label="Sign-in factors" value={factors} hint={factorDetail} hintTone="success" />
        <StatTile label="Active sessions" value={sessionList.length} hint={`${deviceCount} device${deviceCount === 1 ? '' : 's'}`} />
        <StatTile label="Connected apps" value={appList.length} hint="Apps you’ve authorized" />
        <StatTile label="Organizations" value={orgList.length} hint={owned ? `Owner of ${owned}` : 'Member'} />
      </div>

      <div className={styles.navGrid}>
        <NavCard
          to="/account/security"
          icon={<ShieldCheckIcon size={18} />}
          title="Security"
          description="Password, authenticator app, passkeys, and recovery codes."
          cta="Manage security"
        />
        <NavCard
          to="/account/sessions"
          icon={<MonitorIcon size={18} />}
          title="Sessions & devices"
          description="See where you’re signed in and sign out remotely."
          cta="View sessions"
        />
        <NavCard to="/account/contacts" icon={<MailIcon size={18} />} title="Emails & phones" description="Manage contact addresses and set a primary." cta="Manage contacts" />
        <NavCard to="/account/profile" icon={<UserIcon size={18} />} title="Profile" description="Your name and demographic details." cta="Edit profile" />
        <NavCard to="/account/connected" icon={<PlugIcon size={18} />} title="Connected apps" description="Review and revoke apps that access your account." cta="Review access" />
        <NavCard to="/organizations" icon={<BuildingIcon size={18} />} title="Organizations" description="Teams you belong to and pending invitations." cta="View organizations" />
      </div>
    </div>
  );
}
