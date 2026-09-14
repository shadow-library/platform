import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Avatar, Badge, Button, ClientOnly, DropdownMenu, EmptyState, IconButton, Input, Select, Table, toast } from '@shadow-library/ui';

import { AlertTriangleIcon, BotIcon, ClockIcon, LayersIcon, MoreIcon, PlusIcon, SearchIcon, ShieldCheckIcon } from '@/components/icons';
import { QueryState, StatusChip } from '@/components/si';
import { countFlaggedGrants, countGrantsByApplication } from '@/features/bots';
import { useStepUpGate } from '@/features/portal';
import {
  type BotItem,
  botsQueryOptions,
  type BotStatus,
  myOrganisationsQueryOptions,
  orgAccessOf,
  useBotPermissionsQuery,
  useBotsQuery,
  useOrgAccess,
  useResumeBotMutation,
  useSuspendBotMutation,
} from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { daysUntil, formatDate, relativeTime } from '@/lib/format';

import styles from './bots.module.css';

const KEY_EXPIRY_WARNING_DAYS = 7;

interface PermissionsCellProps {
  orgId: string;
  botId: string;
}

function PermissionsCell({ orgId, botId }: PermissionsCellProps): React.JSX.Element {
  const permissions = useBotPermissionsQuery(orgId, botId, true);
  const grants = permissions.data?.grants ?? [];
  const counts = countGrantsByApplication(grants);
  const flagged = countFlaggedGrants(grants);

  if (permissions.isLoading) return <span className={styles.muted}>—</span>;
  if (counts.length === 0) return <span className={styles.muted}>None</span>;

  return (
    <div className={styles.permissionsCell}>
      {counts.map(count => (
        <Badge key={count.applicationId} intent="neutral">
          {count.applicationName} · {count.count}
        </Badge>
      ))}
      {flagged > 0 && (
        <Badge intent="warning">
          <AlertTriangleIcon size={12} />
          {flagged} to review
        </Badge>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_portal/organizations/$orgId/bots/')({
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    if (orgAccessOf(mine, params.orgId).canManage) await context.queryClient.ensureQueryData(botsQueryOptions(params.orgId));
  },
  component: BotsListPage,
});

const STATUS_META: Record<BotStatus, { label: string; intent: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Active', intent: 'success' },
  SUSPENDED: { label: 'Suspended', intent: 'warning' },
  DELETING: { label: 'Deleting', intent: 'neutral' },
  DELETED: { label: 'Deleted', intent: 'neutral' },
};

const MAX_ACTIVE_KEYS = 2;

function matchesQuery(bot: BotItem, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return bot.displayName.toLowerCase().includes(needle) || bot.handle.toLowerCase().includes(needle);
}

function BotsListPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const { org, canManage } = useOrgAccess(orgId);
  const bots = useBotsQuery(orgId, canManage);
  const suspend = useSuspendBotMutation(orgId);
  const resume = useResumeBotMutation(orgId);
  const { require, dialog } = useStepUpGate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | BotStatus>('all');

  const list = useMemo(() => bots.data?.bots ?? [], [bots.data]);
  const usage = bots.data?.usage;
  const atLimit = usage !== undefined && usage.count >= usage.limit;
  const filtered = useMemo(() => list.filter(bot => matchesQuery(bot, search) && (status === 'all' || bot.status === status)), [list, search, status]);

  if (!canManage)
    return (
      <p className={styles.introText}>{org?.type === 'PERSONAL' ? 'Bots aren’t available to personal workspaces.' : 'Bots are managed by the organization’s owners and admins.'}</p>
    );

  const toggleSuspend = (bot: BotItem): void => {
    const mutation = bot.status === 'ACTIVE' ? suspend : resume;
    const verb = bot.status === 'ACTIVE' ? 'suspended' : 'resumed';
    require(() => mutation.mutate(bot.id, { onSuccess: () => toast.success(`${bot.displayName} ${verb}`), onError: error => toast.danger(botErrorMessage(error)) }));
  };

  const goToBot = (bot: BotItem, tab?: 'keys'): void =>
    void navigate({ to: '/organizations/$orgId/bots/$botId', params: { orgId, botId: bot.id }, search: tab ? { tab, generate: tab === 'keys' } : {} });

  if (list.length === 0 && !bots.isLoading && !bots.error)
    return (
      <div className={styles.page}>
        <EmptyState
          illustration={<BotIcon size={40} />}
          title={`Automate ${org?.name ?? 'your organization'} with bots`}
          description="A bot is an identity for scripts and services. Give it only the permissions it needs, then call platform APIs with its API key."
          action={{ label: 'New bot', onClick: () => void navigate({ to: '/organizations/$orgId/bots/new', params: { orgId } }) }}
        />
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <ShieldCheckIcon size={18} className={styles.featureIcon} />
            <div>
              <div className={styles.featureTitle}>Least privilege</div>
              <div className={styles.featureDesc}>Grant per-app permissions, and only the ones you hold yourself.</div>
            </div>
          </div>
          <div className={styles.featureCard}>
            <ClockIcon size={18} className={styles.featureIcon} />
            <div>
              <div className={styles.featureTitle}>Keys that expire</div>
              <div className={styles.featureDesc}>Up to two active keys, each valid for a year at most.</div>
            </div>
          </div>
          <div className={styles.featureCard}>
            <LayersIcon size={18} className={styles.featureIcon} />
            <div>
              <div className={styles.featureTitle}>Every exchange logged</div>
              <div className={styles.featureDesc}>See key use, refused addresses and rate limits.</div>
            </div>
          </div>
        </div>
        {dialog}
      </div>
    );

  return (
    <div className={styles.page}>
      <div className={styles.introRow}>
        <p className={styles.introText}>
          Bots are non-human members of {org?.name ?? 'this organization'}. Each one calls platform APIs with its own API keys and only has the permissions you grant. Bots can’t
          sign in or pass step-up, and they can’t manage other bots.
        </p>
        {usage && (
          <span className={styles.usage}>
            {usage.count} of {usage.limit} bots
          </span>
        )}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input size="sm" placeholder="Search bots…" prefix={<SearchIcon size={15} />} value={search} onValueChange={setSearch} />
        </div>
        <Select size="sm" value={status} onValueChange={value => setStatus(value as 'all' | BotStatus)}>
          <Select.Item value="all">All statuses</Select.Item>
          <Select.Item value="ACTIVE">Active</Select.Item>
          <Select.Item value="SUSPENDED">Suspended</Select.Item>
        </Select>
        <div className={styles.spacer} />
        <div className={styles.newBotGroup}>
          {atLimit && <span className={styles.limitNote}>You’ve reached the {usage?.limit} bot limit.</span>}
          <Button
            variant="primary"
            size="sm"
            prefix={<PlusIcon size={15} />}
            disabled={atLimit}
            onClick={() => void navigate({ to: '/organizations/$orgId/bots/new', params: { orgId } })}
          >
            New bot
          </Button>
        </div>
      </div>

      <div className={styles.tableCard}>
        <QueryState isLoading={bots.isLoading} error={bots.error} isEmpty={false}>
          <Table
            data={filtered}
            rowKey={row => String(row.id)}
            aria-label="Bots"
            emptyState={<div className={styles.tableEmpty}>No bots match your search.</div>}
            columns={[
              {
                id: 'bot',
                header: 'Bot',
                cell: bot => (
                  <Link to="/organizations/$orgId/bots/$botId" params={{ orgId, botId: bot.id }} className={styles.botLink}>
                    <Avatar icon={<BotIcon size={16} />} shape="square" size="sm" />
                    <div className={styles.cellMain}>
                      <div className={styles.cellName}>{bot.displayName}</div>
                      <div className={styles.cellSub}>{bot.handle}[bot]</div>
                    </div>
                  </Link>
                ),
              },
              {
                id: 'status',
                header: 'Status',
                cell: bot => (
                  <StatusChip intent={STATUS_META[bot.status].intent} dot>
                    {STATUS_META[bot.status].label}
                  </StatusChip>
                ),
              },
              { id: 'permissions', header: 'Permissions', cell: bot => <PermissionsCell orgId={orgId} botId={bot.id} /> },
              {
                id: 'keys',
                header: 'API keys',
                cell: bot => (
                  <div className={styles.stackCell}>
                    <span className={styles.cellName}>{bot.activeKeyCount} active</span>
                    {bot.nextKeyExpiresAt && (
                      <ClientOnly>
                        {daysUntil(bot.nextKeyExpiresAt) <= KEY_EXPIRY_WARNING_DAYS && (
                          <span className={styles.keyExpiryWarning}>
                            <ClockIcon size={12} />
                            Key expires{' '}
                            {daysUntil(bot.nextKeyExpiresAt) <= 0 ? 'today' : `in ${daysUntil(bot.nextKeyExpiresAt)} day${daysUntil(bot.nextKeyExpiresAt) === 1 ? '' : 's'}`}
                          </span>
                        )}
                      </ClientOnly>
                    )}
                  </div>
                ),
              },
              {
                id: 'lastUsed',
                header: 'Last used',
                cell: bot =>
                  bot.lastUsedAt ? (
                    <div className={styles.stackCell}>
                      <ClientOnly fallback={<span className={styles.cellName}>{formatDate(bot.lastUsedAt)}</span>}>
                        <span className={styles.cellName}>{relativeTime(bot.lastUsedAt)}</span>
                      </ClientOnly>
                      {bot.lastUsedIp && <span className={styles.cellSub}>{bot.lastUsedIp}</span>}
                    </div>
                  ) : (
                    <span className={styles.muted}>Never used</span>
                  ),
              },
              {
                id: 'actions',
                header: '',
                align: 'end',
                cell: bot => (
                  <DropdownMenu>
                    <DropdownMenu.Trigger asChild>
                      <IconButton variant="ghost" size="sm" aria-label={`Actions for ${bot.displayName}`} icon={<MoreIcon size={16} />} />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item onSelect={() => goToBot(bot)}>View details</DropdownMenu.Item>
                      <DropdownMenu.Item disabled={bot.status !== 'ACTIVE' || bot.activeKeyCount >= MAX_ACTIVE_KEYS} onSelect={() => goToBot(bot, 'keys')}>
                        Generate key
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item disabled={bot.status !== 'ACTIVE' && bot.status !== 'SUSPENDED'} onSelect={() => toggleSuspend(bot)}>
                        {bot.status === 'ACTIVE' ? 'Suspend' : 'Resume'}
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item destructive disabled>
                        Delete…
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                ),
              },
            ]}
          />
        </QueryState>
      </div>
      {dialog}
    </div>
  );
}
