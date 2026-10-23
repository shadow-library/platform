import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Spinner, toast } from '@shadow-library/ui';

import { ArrowLeftIcon, BotIcon, KeyIcon } from '@/components/icons';
import { StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import {
  ActivityTab,
  DeletionNotice,
  GenerateKeyDialog,
  isManageable,
  KeysTab,
  MAX_ACTIVE_KEYS,
  OverviewTab,
  PermissionsTab,
  RECENT_ACTIVITY_LIMIT,
  SettingsTab,
} from '@/features/bots';
import { useStepUpGate } from '@/features/portal';
import {
  botActivityQueryOptions,
  type BotCatalogApplicationItem,
  type BotGrantItem,
  type BotItem,
  botKeysQueryOptions,
  botPermissionCatalogQueryOptions,
  botPermissionsQueryOptions,
  botQueryOptions,
  isApiError,
  myOrganisationsQueryOptions,
  orgAccessOf,
  useBotKeysQuery,
  useBotPermissionCatalogQuery,
  useBotPermissionsQuery,
  useBotQuery,
  useOrgAccess,
  useResumeBotMutation,
  useSuspendBotMutation,
} from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { formatDate } from '@/lib/format';

import styles from '@/features/bots/bots.module.css';

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

const EMPTY_APPLICATIONS: BotCatalogApplicationItem[] = [];
const EMPTY_GRANTS: BotGrantItem[] = [];

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
