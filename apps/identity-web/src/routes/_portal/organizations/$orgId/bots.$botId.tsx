import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  Alert,
  Avatar,
  Button,
  ClientOnly,
  ConfirmDialog,
  DatePicker,
  DescriptionList,
  Dialog,
  FormField,
  Input,
  NumberStepper,
  parseISODate,
  SegmentedControl,
  Select,
  Spinner,
  Table,
  Textarea,
  toast,
  toISODate,
  TokenInput,
  type TokenValue,
} from '@shadow-library/ui';

import { ArrowLeftIcon, BotIcon, KeyIcon } from '@/components/icons';
import { QueryState, SectionCard, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import {
  baselineFromGrants,
  countChangedSlots,
  DeleteBotDialog,
  type DesiredGrantMap,
  desiredGrantsList,
  humanizeResource,
  PermissionsMatrix,
  resolvedNotHeldRemovals,
  resolvedStaleRemovals,
  staleLevelGrants,
  summarizeGrants,
  unrepresentableManagedGrantCount,
  unresolvedNotHeldGrants,
} from '@/features/bots';
import { useStepUpGate } from '@/features/portal';
import {
  type ApiError,
  type BotActivityAction,
  type BotActivityDetailItem,
  type BotActivityItem,
  type BotActivityOutcome,
  botActivityQueryOptions,
  type BotCatalogApplicationItem,
  type BotGrantItem,
  type BotItem,
  type BotKeyItem,
  botKeysQueryOptions,
  botPermissionCatalogQueryOptions,
  botPermissionsQueryOptions,
  botQueryOptions,
  isApiError,
  myOrganisationsQueryOptions,
  orgAccessOf,
  useBotActivityInfiniteQuery,
  useBotActivityQuery,
  useBotKeysQuery,
  useBotPermissionCatalogQuery,
  useBotPermissionsQuery,
  useBotQuery,
  useCreateBotKeyMutation,
  useOrgAccess,
  useReplaceBotPermissionsMutation,
  useResumeBotMutation,
  useRetryBotTransfersMutation,
  useRevokeBotKeyMutation,
  useSuspendBotMutation,
  useUpdateBotMutation,
} from '@/lib/apis';
import { botErrorMessage, botFieldError } from '@/lib/bot-errors';
import { isValidRateLimit, MAX_RATE_LIMIT, MIN_RATE_LIMIT, rateLimitError } from '@/lib/bot-rate-limit';
import { validateCidr } from '@/lib/cidr';
import { daysUntil, formatDate, relativeTime } from '@/lib/format';

import styles from './bots.module.css';

type Tab = 'overview' | 'permissions' | 'keys' | 'activity' | 'settings';

interface BotSearch {
  tab?: Tab;
  generate?: boolean;
}

const TAB_VALUES: Tab[] = ['permissions', 'keys', 'activity', 'settings'];

export const Route = createFileRoute('/_portal/organizations/$orgId/bots/$botId')({
  validateSearch: (search: Record<string, unknown>): BotSearch => {
    const tab = search.tab;
    return { tab: TAB_VALUES.includes(tab as Tab) ? (tab as Tab) : undefined, generate: search.generate === true ? true : undefined };
  },
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    if (!orgAccessOf(mine, params.orgId).canManage) return;
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(botQueryOptions(params.orgId, params.botId)),
        context.queryClient.ensureQueryData(botKeysQueryOptions(params.orgId, params.botId)),
        context.queryClient.ensureQueryData(botPermissionCatalogQueryOptions(params.orgId)),
        context.queryClient.ensureQueryData(botPermissionsQueryOptions(params.orgId, params.botId)),
        context.queryClient.ensureQueryData(botActivityQueryOptions(params.orgId, params.botId, { limit: RECENT_ACTIVITY_LIMIT })),
      ]);
    } catch (error) {
      if (!isApiError(error) || error.status !== 404) throw error;
    }
  },
  component: BotDetailPage,
});

const NAV_ITEMS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'keys', label: 'API keys' },
  { key: 'activity', label: 'Activity' },
  { key: 'settings', label: 'Settings' },
];

const STATUS_META: Record<BotItem['status'], { label: string; intent: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Active', intent: 'success' },
  SUSPENDED: { label: 'Suspended', intent: 'warning' },
  DELETING: { label: 'Deleting', intent: 'neutral' },
  DELETED: { label: 'Deleted', intent: 'neutral' },
};

const MAX_IP_ENTRIES = 20;
const MAX_ACTIVE_KEYS = 2;
const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LIFETIME_DAYS = 365;
const RECENT_ACTIVITY_LIMIT = 3;
const EMPTY_APPLICATIONS: BotCatalogApplicationItem[] = [];
const EMPTY_GRANTS: BotGrantItem[] = [];

function isManageable(status: BotItem['status']): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED';
}

const OUTCOME_META: Record<BotActivityOutcome, { label: string; intent: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SUCCESS: { label: 'Success', intent: 'success' },
  DENIED: { label: 'Refused', intent: 'danger' },
  FAILURE: { label: 'Failed', intent: 'danger' },
};

const ACTION_LABEL: Record<BotActivityAction, string> = {
  'bot.created': 'Created',
  'bot.updated': 'Updated',
  'bot.suspended': 'Suspended',
  'bot.resumed': 'Resumed',
  'bot.permissions.changed': 'Permissions changed',
  'bot.key.created': 'Key generated',
  'bot.key.revoked': 'Key revoked',
  'bot.key.expired': 'Key expired',
  'bot.key.used': 'Key used',
  'bot.key.exchange_denied': 'Key exchange refused',
  'bot.deletion.requested': 'Deletion requested',
  'bot.ownership.transferred': 'Ownership transferred',
  'bot.deleted': 'Deleted',
};

const REFUSAL_REASON_LABEL: Record<string, string> = {
  ip_not_allowed: 'IP not in allowlist',
  key_expired: 'key expired',
  key_revoked: 'key revoked',
  bot_suspended: 'bot suspended',
  rate_limited: 'rate limit reached',
};

function humanizeCode(value: string): string {
  return REFUSAL_REASON_LABEL[value] ?? value.replace(/_/g, ' ');
}

function humanizeField(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function formatGrantLabel(raw: string): string {
  const [, resource, level] = raw.split(':');
  return resource && level ? `${humanizeResource(resource)} · ${level}` : raw;
}

function permissionsChangeSummary(detail: BotActivityDetailItem | undefined): string {
  const added = detail?.added ?? [];
  const removed = detail?.removed ?? [];
  const [firstAdded] = added;
  const [firstRemoved] = removed;
  if (added.length > 0 && removed.length === 0) return added.length === 1 && firstAdded ? `granted ${formatGrantLabel(firstAdded)}` : `granted ${added.length} permissions`;
  if (removed.length > 0 && added.length === 0) return removed.length === 1 && firstRemoved ? `revoked ${formatGrantLabel(firstRemoved)}` : `revoked ${removed.length} permissions`;
  if (added.length > 0 && removed.length > 0) return `changed ${added.length + removed.length} permissions`;
  return 'changed permissions';
}

function describeEvent(event: BotActivityItem): string {
  const actorName = event.actor?.displayName ?? 'A former member';
  switch (event.action as BotActivityAction) {
    case 'bot.created':
      return `${actorName} created the bot`;
    case 'bot.updated':
      return `${actorName} updated ${event.detail?.fields?.map(humanizeField).join(', ') || 'the bot'}`;
    case 'bot.suspended':
      return `${actorName} suspended the bot`;
    case 'bot.resumed':
      return `${actorName} resumed the bot`;
    case 'bot.permissions.changed':
      return `${actorName} ${permissionsChangeSummary(event.detail)}`;
    case 'bot.key.created':
      return `${actorName} generated key ${event.keyName ?? ''}`.trim();
    case 'bot.key.revoked':
      return `${actorName} revoked key ${event.keyName ?? ''}`.trim();
    case 'bot.key.expired':
      return `Key ${event.keyName ?? ''} expired`.trim();
    case 'bot.key.used':
      return `Key ${event.keyName ?? 'key'} used`;
    case 'bot.key.exchange_denied':
      return `Key exchange refused${event.detail?.reason ? `: ${humanizeCode(event.detail.reason)}` : ''}`;
    case 'bot.deletion.requested':
      return event.detail?.retriedTransfers ? `${actorName} retried the record transfer` : `${actorName} requested deletion`;
    case 'bot.ownership.transferred':
      return `${actorName} transferred ownership`;
    case 'bot.deleted':
      return `${actorName} deleted the bot`;
    default:
      return event.action;
  }
}

function BotDetailPage(): React.JSX.Element {
  const { orgId, botId } = Route.useParams();
  const { tab = 'overview', generate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { org, canManage } = useOrgAccess(orgId);
  const bot = useBotQuery(orgId, botId, canManage);
  const keys = useBotKeysQuery(orgId, botId, canManage);
  const catalog = useBotPermissionCatalogQuery(orgId, canManage);
  const permissions = useBotPermissionsQuery(orgId, botId, canManage);
  const suspend = useSuspendBotMutation(orgId);
  const resume = useResumeBotMutation(orgId);
  const { require, dialog } = useStepUpGate();
  const [generateOpen, setGenerateOpen] = useState(() => generate === true && bot.data?.status === 'ACTIVE' && bot.data.activeKeyCount < MAX_ACTIVE_KEYS);
  const [revealed, setRevealed] = useState<{ key: string; name: string; expiresAt: string } | null>(null);

  useEffect(() => {
    if (!generate) return;
    void navigate({ search: prev => ({ ...prev, generate: undefined }), replace: true });
  }, [generate, navigate]);

  if (!canManage)
    return (
      <p className={styles.introText}>{org?.type === 'PERSONAL' ? 'Bots aren’t available to personal workspaces.' : 'Bots are managed by the organization’s owners and admins.'}</p>
    );

  if (bot.isLoading)
    return (
      <div className={styles.loadingBlock}>
        <Spinner size="lg" label="Loading bot" />
      </div>
    );

  if (bot.error || !bot.data)
    return (
      <div className={styles.page}>
        <Link to="/organizations/$orgId/bots" params={{ orgId }} className={styles.backLink}>
          <ArrowLeftIcon size={15} />
          All bots
        </Link>
        <Alert intent="danger" title="Couldn’t load this bot">
          {bot.error ? botErrorMessage(bot.error) : 'This bot no longer exists.'}
        </Alert>
      </div>
    );

  const data = bot.data;
  const status = STATUS_META[data.status];
  const activeKeys = keys.data?.keys.filter(key => key.status === 'ACTIVE') ?? [];
  const canGenerateKey = data.status === 'ACTIVE' && activeKeys.length < MAX_ACTIVE_KEYS;
  const manageable = isManageable(data.status);
  const applications = catalog.data?.applications ?? EMPTY_APPLICATIONS;
  const grants = permissions.data?.grants ?? EMPTY_GRANTS;
  const goToTab = (next: Tab): void => void navigate({ search: prev => ({ ...prev, tab: next === 'overview' ? undefined : next }), replace: true });

  const toggleSuspend = (): void => {
    const mutation = data.status === 'ACTIVE' ? suspend : resume;
    const verb = data.status === 'ACTIVE' ? 'suspended' : 'resumed';
    require(() => mutation.mutate(botId, { onSuccess: () => toast.success(`${data.displayName} ${verb}`), onError: error => toast.danger(botErrorMessage(error)) }));
  };

  return (
    <div className={styles.page}>
      <Link to="/organizations/$orgId/bots" params={{ orgId }} className={styles.backLink}>
        <ArrowLeftIcon size={15} />
        All bots
      </Link>

      <div className={styles.detailHead}>
        <Avatar icon={<BotIcon size={28} />} shape="square" size="xl" />
        <div className={styles.detailHeadMain}>
          <div className={styles.detailEyebrow}>Bot</div>
          <div className={styles.detailName}>
            {data.displayName}
            <StatusChip intent={status.intent} dot>
              {status.label}
            </StatusChip>
          </div>
          <div className={styles.detailMeta}>
            <span className={styles.detailMetaId}>{data.handle}[bot]</span>
            <span>·</span>
            <span>
              ID <span className={styles.detailMetaId}>{data.id}</span>
            </span>
            {data.createdBy && (
              <>
                <span>·</span>
                <span>
                  Created by {data.createdBy.displayName ?? 'a former member'} on {formatDate(data.createdAt)}
                </span>
              </>
            )}
          </div>
        </div>
        {manageable && (
          <div className={styles.detailActions}>
            <Button variant="secondary" size="sm" loading={suspend.isPending || resume.isPending} onClick={toggleSuspend}>
              {data.status === 'ACTIVE' ? 'Suspend' : 'Resume'}
            </Button>
            <Button variant="primary" size="sm" prefix={<KeyIcon size={14} />} disabled={!canGenerateKey} onClick={() => setGenerateOpen(true)}>
              Generate key
            </Button>
          </div>
        )}
      </div>

      {data.deletion && <DeletionNotice orgId={orgId} bot={data} require={require} />}

      <div className={styles.detailLayout}>
        <nav className={styles.sectionNav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              className={styles.navItem}
              data-active={tab === item.key || undefined}
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => goToTab(item.key)}
            >
              <span className={styles.navLabel}>{item.label}</span>
              {item.key === 'keys' && <span className={styles.navCount}>{data.activeKeyCount}</span>}
              {item.key === 'permissions' && grants.length > 0 && <span className={styles.navCount}>{grants.length}</span>}
            </button>
          ))}
        </nav>

        <div className={styles.sectionBody}>
          {tab === 'overview' && (
            <OverviewTab
              bot={data}
              activeKeys={activeKeys}
              orgId={orgId}
              botId={botId}
              applications={applications}
              grants={grants}
              onManageKeys={() => goToTab('keys')}
              onEditPermissions={() => goToTab('permissions')}
              onViewActivity={() => goToTab('activity')}
            />
          )}
          {tab === 'permissions' && (
            <PermissionsTab
              botId={botId}
              orgId={orgId}
              applications={applications}
              catalogLoading={catalog.isLoading}
              catalogError={catalog.error}
              grants={grants}
              grantsLoading={permissions.isLoading}
              grantsError={permissions.error}
              require={require}
            />
          )}
          {tab === 'activity' && <ActivityTab orgId={orgId} botId={botId} />}
          {tab === 'keys' && (
            <KeysTab
              orgId={orgId}
              botId={botId}
              keys={keys.data?.keys ?? []}
              isLoading={keys.isLoading}
              canGenerateKey={canGenerateKey}
              require={require}
              onGenerate={() => setGenerateOpen(true)}
            />
          )}
          {tab === 'settings' && (
            <SettingsTab
              orgId={orgId}
              organisationName={org?.name ?? 'this organization'}
              bot={data}
              require={require}
              onSuspendToggle={toggleSuspend}
              suspendPending={suspend.isPending || resume.isPending}
            />
          )}
        </div>
      </div>

      <GenerateKeyDialog
        orgId={orgId}
        botId={botId}
        botLabel={`${data.handle}[bot]`}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        require={require}
        onGenerated={(key, name, expiresAt) => setRevealed({ key, name, expiresAt })}
      />
      <SecretDialog
        open={revealed !== null}
        onOpenChange={open => !open && setRevealed(null)}
        title="Your new API key"
        subtitle={revealed ? `${revealed.name} · expires ${formatDate(revealed.expiresAt)}` : undefined}
        description="Store it in your secret manager. Anyone holding it can act as this bot."
        secret={revealed?.key}
        downloadName={`${data.handle}-bot-key.txt`}
        requireConfirm
      />
      {dialog}
    </div>
  );
}

interface DeletionNoticeProps {
  orgId: string;
  bot: BotItem;
  require: (action: () => void) => void;
}

/** A deleting bot has no Suspend/Resume, so this banner is the only place its state and any stuck handover are visible. */
function DeletionNotice({ orgId, bot, require }: DeletionNoticeProps): React.JSX.Element | null {
  const retry = useRetryBotTransfersMutation(orgId);
  const deletion = bot.deletion;
  if (!deletion) return null;

  const recipient = deletion.transferTo?.displayName ?? 'a member';
  const stuckNames = deletion.stalledApplications.join(', ');

  if (deletion.stalled)
    return (
      <Alert
        intent="danger"
        title="Deletion is stuck"
        action={{
          label: retry.isPending ? 'Retrying…' : 'Retry transfer',
          onClick: () =>
            require(() =>
              retry.mutate(bot.id, {
                onSuccess: result =>
                  result.retried > 0
                    ? toast.success(`${result.retried === 1 ? 'Transfer' : `${result.retried} transfers`} queued again`)
                    : toast.info('Nothing to requeue — no transfer has run out of attempts yet.'),
                onError: error => toast.danger(botErrorMessage(error)),
              }),
            ),
        }}
      >
        {stuckNames ? `${stuckNames} did not confirm the handover` : 'An app did not confirm the handover'} after every retry. The bot stays suspended and its records stay with it
        until the transfer succeeds.
      </Alert>
    );

  return (
    <Alert intent="warning" title="Deletion in progress">
      Requested on {formatDate(deletion.requestedAt)}. The bot is already suspended; {deletion.done} of {deletion.done + deletion.pending + deletion.failed} apps have handed their
      records to {recipient}.
    </Alert>
  );
}

interface OverviewTabProps {
  bot: BotItem;
  activeKeys: BotKeyItem[];
  orgId: string;
  botId: string;
  applications: BotCatalogApplicationItem[];
  grants: BotGrantItem[];
  onManageKeys: () => void;
  onEditPermissions: () => void;
  onViewActivity: () => void;
}

function OverviewTab({ bot, activeKeys, orgId, botId, applications, grants, onManageKeys, onEditPermissions, onViewActivity }: OverviewTabProps): React.JSX.Element {
  const recent = useBotActivityQuery(orgId, botId, { limit: RECENT_ACTIVITY_LIMIT }, true);
  const permissionGroups = useMemo(() => summarizeGrants(applications, grants), [applications, grants]);
  const flaggedCount = useMemo(() => permissionGroups.reduce((count, group) => count + group.items.filter(item => item.flagged).length, 0), [permissionGroups]);

  return (
    <div className={styles.overviewGrid}>
      <div className={styles.cardStack}>
        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Details</div>
          <DescriptionList layout="row" termWidth={130}>
            <DescriptionList.Item term="Handle" mono>
              {bot.handle}[bot]
            </DescriptionList.Item>
            <DescriptionList.Item term="Bot ID" mono copyable>
              {bot.id}
            </DescriptionList.Item>
            <DescriptionList.Item term="Description">{bot.description || '—'}</DescriptionList.Item>
            <DescriptionList.Item term="Allowed IPs">
              {bot.ipAllowlist.length > 0 ? (
                <div className={styles.ipList}>
                  {bot.ipAllowlist.map(range => (
                    <span key={range} className={styles.mono}>
                      {range}
                    </span>
                  ))}
                </div>
              ) : (
                'All addresses'
              )}
            </DescriptionList.Item>
            <DescriptionList.Item term="Rate limit">{bot.rateLimitPerMinute} requests / minute per app</DescriptionList.Item>
          </DescriptionList>
        </div>

        <div className={styles.detailCard}>
          <div className={styles.detailCardTitle}>Calling an API</div>
          <p className={styles.cardDesc}>Send a key as a bearer token. Every app accepts it the same way.</p>
          <div className={styles.codeBlock}>{'curl https://<app-host>/api/v1/... \\\n  -H "Authorization: Bearer $SHADOW_BOT_KEY"'}</div>
        </div>
      </div>

      <div className={styles.cardStack}>
        <div className={styles.detailCard}>
          <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
            <div className={styles.cardTitleInline}>Permissions</div>
            <div className={styles.overviewCardActions}>
              {flaggedCount > 0 && <StatusChip intent="warning">Review</StatusChip>}
              <button type="button" className={styles.linkButton} onClick={onEditPermissions}>
                Edit
              </button>
            </div>
          </div>
          {permissionGroups.length === 0 ? (
            <p className={styles.muted}>No permissions granted yet.</p>
          ) : (
            <div className={styles.rowList}>
              {permissionGroups.flatMap(group =>
                group.items.map(item => (
                  <div key={`${group.applicationId}-${item.resource}`} className={styles.permissionRow}>
                    <Avatar name={group.applicationName} shape="square" size="sm" />
                    <span className={styles.permissionResource}>{item.resourceLabel}</span>
                    <span className={styles.muted}>{item.levelLabel}</span>
                    {item.flagged && <StatusChip intent="warning">Review</StatusChip>}
                  </div>
                )),
              )}
            </div>
          )}
        </div>

        <div className={styles.detailCard}>
          <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
            <div className={styles.cardTitleInline}>API keys</div>
            <span className={styles.tabHeadNote}>
              {activeKeys.length} of {MAX_ACTIVE_KEYS} active
            </span>
          </div>
          {activeKeys.length === 0 ? (
            <p className={styles.muted}>No active keys yet.</p>
          ) : (
            <div className={styles.rowList}>
              {activeKeys.map(key => (
                <div key={key.id} className={styles.listRow}>
                  <div className={styles.listMain}>
                    <div className={styles.listName}>{key.name}</div>
                    <div className={styles.listSub}>
                      Expires {formatDate(key.expiresAt)} · used{' '}
                      <ClientOnly fallback={key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never'}>{key.lastUsedAt ? relativeTime(key.lastUsedAt) : 'never'}</ClientOnly>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className={styles.manageKeysRow}>
            <Button variant="secondary" size="sm" onClick={onManageKeys}>
              Manage keys
            </Button>
          </div>
        </div>

        <div className={styles.detailCard}>
          <div className={`${styles.tabHead} ${styles.tabHeadTight}`}>
            <div className={styles.cardTitleInline}>Recent activity</div>
            <button type="button" className={styles.linkButton} onClick={onViewActivity}>
              View all
            </button>
          </div>
          <QueryState isLoading={recent.isLoading} error={recent.error} isEmpty={!recent.isLoading && (recent.data?.events.length ?? 0) === 0} emptyTitle="No activity yet">
            <div className={styles.rowList}>
              {(recent.data?.events ?? []).map(event => (
                <div key={event.id} className={styles.activityRow}>
                  <span className={styles.activityDot} data-outcome={event.outcome} />
                  <span className={styles.activityText}>{describeEvent(event)}</span>
                  <ClientOnly fallback={<span className={styles.listSub}>{formatDate(event.occurredAt)}</span>}>
                    <span className={styles.listSub}>{relativeTime(event.occurredAt)}</span>
                  </ClientOnly>
                </div>
              ))}
            </div>
          </QueryState>
        </div>
      </div>
    </div>
  );
}

interface PermissionsTabProps {
  orgId: string;
  botId: string;
  applications: BotCatalogApplicationItem[];
  catalogLoading: boolean;
  catalogError: ApiError | null;
  grants: BotGrantItem[];
  grantsLoading: boolean;
  grantsError: ApiError | null;
  require: (action: () => void) => void;
}

function PermissionsTab({ orgId, botId, applications, catalogLoading, catalogError, grants, grantsLoading, grantsError, require }: PermissionsTabProps): React.JSX.Element {
  const replace = useReplaceBotPermissionsMutation(orgId);
  const baseline = useMemo(() => baselineFromGrants(applications, grants), [applications, grants]);
  const [desired, setDesired] = useState<DesiredGrantMap>(baseline);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [syncedBaseline, setSyncedBaseline] = useState(baseline);

  if (syncedBaseline !== baseline) {
    setSyncedBaseline(baseline);
    setDesired(baseline);
  }

  const stale = useMemo(() => staleLevelGrants(applications, grants, baseline, desired), [applications, grants, baseline, desired]);
  const notHeld = useMemo(() => unresolvedNotHeldGrants(applications, grants, baseline, desired), [applications, grants, baseline, desired]);
  const changedCount =
    countChangedSlots(baseline, desired) +
    stale.length +
    resolvedNotHeldRemovals(applications, grants, desired) +
    resolvedStaleRemovals(applications, grants, desired) +
    unrepresentableManagedGrantCount(grants);

  const discard = (): void => {
    setDesired(baseline);
    setSaveError(null);
  };

  const save = (): void => {
    setSaveError(null);
    require(() => replace.mutate({ botId, grants: desiredGrantsList(desired) }, { onSuccess: () => toast.success('Permissions updated'), onError: error => setSaveError(error) }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>Permissions</h2>
          <p className={styles.tabDesc}>Grants belong to the organization, not to the admin who made them. Changes reach every app within a minute.</p>
        </div>
      </div>

      {saveError && (
        <Alert intent="danger" title="Couldn’t save permissions">
          {botErrorMessage(saveError)}
        </Alert>
      )}

      {notHeld.length > 0 && (
        <Alert intent="warning" title="Some grants aren’t yours to keep">
          <ul className={styles.notHeldList}>
            {notHeld.map(entry => (
              <li key={`${entry.applicationId}-${entry.resource}`}>
                You don’t hold {entry.applicationName} · {entry.resourceLabel} · {entry.levelLabel} — remove it explicitly
                {entry.hasSibling ? ' (which also clears the other grant on that resource)' : ''}, or ask someone who does.
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className={styles.detailCard}>
        <QueryState isLoading={catalogLoading || grantsLoading} error={catalogError ?? grantsError} isEmpty={false}>
          <PermissionsMatrix applications={applications} grants={grants} desired={desired} onDesiredChange={setDesired} />
        </QueryState>
      </div>

      {changedCount > 0 && (
        <div className={styles.unsavedBar}>
          <span className={styles.unsavedDot} />
          <span className={styles.unsavedText}>
            <strong>
              {changedCount} unsaved change{changedCount === 1 ? '' : 's'}
            </strong>
          </span>
          <Button variant="ghost" size="sm" onClick={discard}>
            Discard
          </Button>
          <Button variant="primary" size="sm" loading={replace.isPending} disabled={notHeld.length > 0} onClick={save}>
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}

interface ActivityTabProps {
  orgId: string;
  botId: string;
}

function ActivityTab({ orgId, botId }: ActivityTabProps): React.JSX.Element {
  const [action, setAction] = useState<'all' | BotActivityAction>('all');
  const [outcome, setOutcome] = useState<'all' | BotActivityOutcome>('all');
  const filter = { action: action === 'all' ? undefined : action, outcome: outcome === 'all' ? undefined : outcome };
  const activity = useBotActivityInfiniteQuery(orgId, botId, filter, true);
  const events = activity.data?.pages.flatMap(page => page.events) ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>Activity</h2>
          <p className={styles.tabDesc}>Key exchanges, refusals and changes to this bot. What the bot does inside each app is kept in that app.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Select size="sm" aria-label="Filter activity by event" value={action} onValueChange={value => setAction(value as 'all' | BotActivityAction)}>
          <Select.Item value="all">All events</Select.Item>
          {(Object.keys(ACTION_LABEL) as BotActivityAction[]).map(key => (
            <Select.Item key={key} value={key}>
              {ACTION_LABEL[key]}
            </Select.Item>
          ))}
        </Select>
        <Select size="sm" aria-label="Filter activity by outcome" value={outcome} onValueChange={value => setOutcome(value as 'all' | BotActivityOutcome)}>
          <Select.Item value="all">All outcomes</Select.Item>
          {(Object.keys(OUTCOME_META) as BotActivityOutcome[]).map(key => (
            <Select.Item key={key} value={key}>
              {OUTCOME_META[key].label}
            </Select.Item>
          ))}
        </Select>
      </div>

      <div className={styles.tableCard}>
        <QueryState
          isLoading={activity.isLoading}
          error={activity.error}
          isEmpty={!activity.isLoading && events.length === 0}
          emptyTitle="No activity yet"
          emptyDescription="Key exchanges and changes to this bot will show up here."
        >
          <Table
            data={events}
            rowKey="id"
            aria-label="Bot activity"
            columns={[
              {
                id: 'time',
                header: 'Time',
                cell: event => (
                  <ClientOnly fallback={<span className={styles.cellName}>{formatDate(event.occurredAt)}</span>}>
                    <span className={styles.cellName}>{relativeTime(event.occurredAt)}</span>
                  </ClientOnly>
                ),
              },
              { id: 'event', header: 'Event', cell: event => <span>{describeEvent(event)}</span> },
              {
                id: 'key',
                header: 'Key · IP',
                cell: event =>
                  event.keyName || event.ip ? (
                    <div className={styles.stackCell}>
                      {event.keyName && <span className={styles.cellName}>{event.keyName}</span>}
                      {event.ip && <span className={styles.cellSub}>{event.ip}</span>}
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  ),
              },
              { id: 'outcome', header: 'Outcome', cell: event => <StatusChip intent={OUTCOME_META[event.outcome].intent}>{OUTCOME_META[event.outcome].label}</StatusChip> },
            ]}
          />
        </QueryState>
      </div>

      {activity.hasNextPage && (
        <div className={styles.manageKeysRow}>
          <Button variant="secondary" size="sm" loading={activity.isFetchingNextPage} onClick={() => void activity.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}

      <p className={styles.tabDesc}>Successful key use is summarised at most once an hour per key.</p>
    </div>
  );
}

interface KeysTabProps {
  orgId: string;
  botId: string;
  keys: BotKeyItem[];
  isLoading: boolean;
  canGenerateKey: boolean;
  require: (action: () => void) => void;
  onGenerate: () => void;
}

function KeysTab({ orgId, botId, keys, isLoading, canGenerateKey, require, onGenerate }: KeysTabProps): React.JSX.Element {
  const revoke = useRevokeBotKeyMutation(orgId);
  const [revokeTarget, setRevokeTarget] = useState<BotKeyItem | null>(null);

  const activeKeys = keys.filter(key => key.status === 'ACTIVE');
  const inactiveKeys = keys.filter(key => key.status !== 'ACTIVE');

  const doRevoke = (): void => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    require(() =>
      revoke.mutate(
        { botId, keyId: target.id },
        {
          onSuccess: () => {
            toast.success('Key revoked');
            setRevokeTarget(null);
          },
          onError: error => toast.danger(botErrorMessage(error)),
        },
      ),
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabHead}>
        <div className={styles.tabHeadMain}>
          <h2 className={styles.tabTitle}>API keys</h2>
          <p className={styles.tabDesc}>A bot can have two active keys, so you can rotate without downtime. Every key expires within a year.</p>
        </div>
        <div className={styles.tabHeadActions}>
          <Button variant="primary" size="sm" prefix={<KeyIcon size={14} />} disabled={!canGenerateKey} onClick={onGenerate}>
            Generate key
          </Button>
          {!canGenerateKey && <div className={styles.tabHeadNote}>Revoke a key to add another</div>}
        </div>
      </div>

      <div className={styles.tableCard}>
        <Table
          data={activeKeys}
          rowKey="id"
          loading={isLoading}
          aria-label="Active API keys"
          emptyState={<div className={styles.tableEmpty}>No active keys yet.</div>}
          columns={[
            {
              id: 'name',
              header: 'Name',
              cell: key => (
                <div className={styles.cellMain}>
                  <div className={styles.cellName}>{key.name}</div>
                  <div className={styles.cellSub}>
                    Created {formatDate(key.createdAt)} by {key.createdBy?.displayName ?? 'a former member'}
                  </div>
                </div>
              ),
            },
            { id: 'prefix', header: 'Key', cell: key => <span className={styles.mono}>{key.keyPrefix}…</span> },
            {
              id: 'expires',
              header: 'Expires',
              cell: key => {
                const remaining = daysUntil(key.expiresAt);
                return (
                  <div className={styles.stackCell}>
                    <span className={styles.cellName}>{formatDate(key.expiresAt)}</span>
                    <ClientOnly>
                      {remaining <= EXPIRY_WARNING_DAYS && (
                        <StatusChip intent="warning">
                          in {remaining} day{remaining === 1 ? '' : 's'}
                        </StatusChip>
                      )}
                    </ClientOnly>
                  </div>
                );
              },
            },
            {
              id: 'lastUsed',
              header: 'Last used',
              cell: key => (
                <ClientOnly fallback={<span className={styles.muted}>{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'never'}</span>}>
                  <span className={styles.muted}>{key.lastUsedAt ? `${relativeTime(key.lastUsedAt)}${key.lastUsedIp ? ` · ${key.lastUsedIp}` : ''}` : 'never'}</span>
                </ClientOnly>
              ),
            },
            {
              id: 'actions',
              header: '',
              align: 'end',
              cell: key => (
                <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(key)}>
                  Revoke
                </Button>
              ),
            },
          ]}
        />
      </div>

      {inactiveKeys.length > 0 && (
        <div className={styles.revokedSection}>
          <div className={styles.revokedTitle}>Revoked &amp; expired</div>
          <div className={styles.rowList}>
            {inactiveKeys.map(key => (
              <div key={key.id} className={styles.listRow}>
                <div className={styles.listMain}>
                  <div className={styles.listName}>
                    {key.name} <span className={styles.listSubMono}>{key.keyPrefix}…</span>
                  </div>
                  <div className={styles.listSub}>
                    {key.status === 'REVOKED'
                      ? `Revoked ${formatDate(key.revokedAt)} by ${key.revokedBy?.displayName ?? 'a former member'}`
                      : `Expired ${formatDate(key.expiresAt)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={open => !open && setRevokeTarget(null)}
        intent="danger"
        title={revokeTarget ? `Revoke ${revokeTarget.name}?` : 'Revoke key?'}
        description="Anything using this key stops working immediately. This cannot be undone."
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        onConfirm={doRevoke}
      />
    </div>
  );
}

interface SettingsTabProps {
  orgId: string;
  organisationName: string;
  bot: BotItem;
  require: (action: () => void) => void;
  onSuspendToggle: () => void;
  suspendPending: boolean;
}

function SettingsTab({ orgId, organisationName, bot, require, onSuspendToggle, suspendPending }: SettingsTabProps): React.JSX.Element {
  const update = useUpdateBotMutation(orgId);
  const navigate = Route.useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayName, setDisplayName] = useState(bot.displayName);
  const [description, setDescription] = useState(bot.description ?? '');
  const [ipAllowlist, setIpAllowlist] = useState<TokenValue[]>(bot.ipAllowlist.map(value => ({ value, valid: true })));
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<number | null>(bot.rateLimitPerMinute);
  const [nameError, setNameError] = useState<string | undefined>();

  const hasInvalidIp = ipAllowlist.some(token => !token.valid);
  const rateLimitMessage = rateLimitError(rateLimitPerMinute);
  const manageable = isManageable(bot.status);

  const saveGeneral = (): void => {
    setNameError(undefined);
    const name = displayName.trim();
    if (!name) {
      setNameError('Enter a display name.');
      return;
    }
    require(() =>
      update.mutate(
        { botId: bot.id, body: { displayName: name, description: description.trim() || null } },
        { onSuccess: () => toast.success('Bot updated'), onError: error => toast.danger(botErrorMessage(error)) },
      ),
    );
  };

  const saveNetwork = (): void => {
    if (hasInvalidIp || !isValidRateLimit(rateLimitPerMinute)) return;
    const validIps = ipAllowlist.filter(token => token.valid).map(token => token.value);
    require(() =>
      update.mutate(
        { botId: bot.id, body: { ipAllowlist: validIps, rateLimitPerMinute } },
        { onSuccess: () => toast.success('Network settings updated'), onError: error => toast.danger(botErrorMessage(error)) },
      ),
    );
  };

  return (
    <div className={styles.settingsStack}>
      <SectionCard title="General" description="The handle can’t change, because records the bot owns point to it.">
        <div className={styles.form}>
          <FormField label="Display name" error={nameError}>
            <Input value={displayName} onValueChange={setDisplayName} />
          </FormField>
          <FormField label="Handle" helper="Handles can’t be changed after creation.">
            <Input value={bot.handle} suffix="[bot]" disabled readOnly />
          </FormField>
          <FormField label="Description" optional>
            <Textarea value={description} onValueChange={setDescription} minRows={2} maxLength={280} />
          </FormField>
          <div className={styles.formActions}>
            <Button variant="primary" size="sm" loading={update.isPending} onClick={saveGeneral}>
              Save changes
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Network & limits" description="Checked every time an app exchanges one of this bot’s keys.">
        <div className={styles.form}>
          <FormField
            label="Allowed IP ranges"
            error={hasInvalidIp ? 'Fix or remove the invalid IP range before continuing.' : undefined}
            helper={hasInvalidIp ? undefined : 'Requests from any other address are refused. Leave empty to allow all addresses.'}
          >
            <TokenInput value={ipAllowlist} onValueChange={setIpAllowlist} validate={validateCidr} maxTokens={MAX_IP_ENTRIES} placeholder="Add a CIDR range" />
          </FormField>
          <FormField label="Rate limit" error={rateLimitMessage} helper={rateLimitMessage ? undefined : 'Requests over the limit get a 429 response.'}>
            <NumberStepper
              value={rateLimitPerMinute}
              onValueChange={setRateLimitPerMinute}
              min={MIN_RATE_LIMIT}
              max={MAX_RATE_LIMIT}
              clampOnBlur={false}
              unit="requests / minute per app"
            />
          </FormField>
          <div className={styles.formActions}>
            <Button variant="primary" size="sm" loading={update.isPending} disabled={hasInvalidIp || !isValidRateLimit(rateLimitPerMinute)} onClick={saveNetwork}>
              Save changes
            </Button>
          </div>
        </div>
      </SectionCard>

      {manageable && (
        <div className={styles.suspendCard}>
          <div>
            <div className={styles.dangerTitle}>{bot.status === 'ACTIVE' ? 'Suspend this bot' : 'Resume this bot'}</div>
            <div className={styles.dangerDesc}>
              {bot.status === 'ACTIVE'
                ? 'All of its keys stop working within a minute. Its records and grants stay, and you can resume it at any time.'
                : 'Its keys start working again immediately.'}
            </div>
          </div>
          <Button variant="secondary" loading={suspendPending} onClick={onSuspendToggle}>
            {bot.status === 'ACTIVE' ? 'Suspend bot' : 'Resume bot'}
          </Button>
        </div>
      )}

      {manageable && (
        <div className={styles.dangerCard}>
          <div>
            <div className={styles.dangerTitle}>Delete this bot</div>
            <div className={styles.dangerDesc}>Its records move to a member you choose first. Keys and grants are removed permanently.</div>
          </div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete bot…
          </Button>
        </div>
      )}

      <DeleteBotDialog
        orgId={orgId}
        organisationName={organisationName}
        bot={bot}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        require={require}
        onDeleted={() => void navigate({ to: '/organizations/$orgId/bots', params: { orgId } })}
      />
    </div>
  );
}

type ExpiryOption = '30' | '90' | '180' | '365' | 'custom';

const EXPIRY_LABEL: Record<ExpiryOption, string> = { '30': '30 days', '90': '90 days', '180': '180 days', '365': '1 year', custom: 'Custom date' };
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

function expiryCeiling(): number {
  return Date.now() + MAX_KEY_LIFETIME_DAYS * DAY_MS - EXPIRY_SAFETY_MARGIN_MS;
}

function presetExpiry(days: number): Date {
  return new Date(Math.min(Date.now() + days * DAY_MS, expiryCeiling()));
}

function customExpiry(isoDate: string): Date | null {
  const parsed = parseISODate(isoDate);
  if (!parsed) return null;
  const endOfDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999);
  return new Date(Math.min(endOfDay.getTime(), expiryCeiling()));
}

interface GenerateKeyDialogProps {
  orgId: string;
  botId: string;
  botLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  require: (action: () => void) => void;
  onGenerated: (key: string, name: string, expiresAt: string) => void;
}

function GenerateKeyDialog({ orgId, botId, botLabel, open, onOpenChange, require, onGenerated }: GenerateKeyDialogProps): React.JSX.Element {
  const create = useCreateBotKeyMutation(orgId);
  const [name, setName] = useState('');
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>('90');
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [expiryError, setExpiryError] = useState<string | undefined>();

  const today = new Date();
  const minDate = toISODate(addDays(today, 1));
  const maxDate = toISODate(addDays(today, MAX_KEY_LIFETIME_DAYS - 1));
  const resolvedDate = expiryOption === 'custom' ? (customDate ? customExpiry(customDate) : null) : presetExpiry(Number(expiryOption));

  const reset = (): void => {
    setName('');
    setExpiryOption('90');
    setCustomDate(null);
    setNameError(undefined);
    setExpiryError(undefined);
  };

  const submit = (): void => {
    setNameError(undefined);
    setExpiryError(undefined);
    const keyName = name.trim();
    if (!keyName) {
      setNameError('Name this key.');
      return;
    }
    if (!resolvedDate) {
      setExpiryError('Pick an expiry date.');
      return;
    }
    require(() =>
      create.mutate(
        { botId, body: { name: keyName, expiresAt: resolvedDate.toISOString() } },
        {
          onSuccess: result => {
            toast.success('Key generated');
            onOpenChange(false);
            reset();
            onGenerated(result.key, result.name, result.expiresAt);
            create.reset();
          },
          onError: error => {
            const fieldError = botFieldError(error);
            if (fieldError?.field === 'expiresAt') setExpiryError(fieldError.message);
            else toast.danger(botErrorMessage(error));
          },
        },
      ),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Content size="md">
        <Dialog.Header title="Generate API key" description={`For ${botLabel}. You’ll see the key once, right after you generate it.`} />
        <Dialog.Body>
          <div className={styles.form}>
            <FormField label="Key name" required error={nameError} helper={nameError ? undefined : 'Name it after where the key will live.'}>
              <Input value={name} onValueChange={setName} placeholder="github-actions-release" autoFocus />
            </FormField>
            <FormField
              label="Expires after"
              error={expiryError}
              helper={expiryError ? undefined : resolvedDate ? `Expires on ${formatDate(resolvedDate.toISOString())}.` : undefined}
            >
              <SegmentedControl value={expiryOption} onValueChange={value => setExpiryOption(value as ExpiryOption)} aria-label="Key expiry">
                {(Object.keys(EXPIRY_LABEL) as ExpiryOption[]).map(option => (
                  <SegmentedControl.Item key={option} value={option}>
                    {EXPIRY_LABEL[option]}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl>
              {expiryOption === 'custom' && (
                <div className={styles.customDateWrap}>
                  <DatePicker value={customDate} onValueChange={setCustomDate} min={minDate} max={maxDate} />
                </div>
              )}
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Generate key
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
