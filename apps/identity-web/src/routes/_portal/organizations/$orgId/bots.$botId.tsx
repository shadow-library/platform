import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Button, Spinner, Tabs, toast } from '@shadow-library/ui';

import { BotIcon } from '@/components/icons';
import { CopyButton, GatedNotice, PageHeader, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import {
  ActivityTab,
  BOT_TABS,
  type BotTab,
  canGenerateKey,
  DeletionNotice,
  GenerateKeyDialog,
  isBotTab,
  isManageable,
  KeysTab,
  OverviewTab,
  parseBotTab,
  PermissionsTab,
  RECENT_ACTIVITY_LIMIT,
  SettingsTab,
  summarizeKeys,
} from '@/features/bots';
import { useCrumbLeaf, useStepUpGate } from '@/features/portal';
import {
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

interface BotSearch {
  tab?: BotTab;
  generate?: boolean;
}

export const Route = createFileRoute('/_portal/organizations/$orgId/bots/$botId')({
  validateSearch: (search: Record<string, unknown>): BotSearch => ({ tab: parseBotTab(search.tab), generate: search.generate === true ? true : undefined }),
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

const TAB_LABEL: Record<BotTab, string> = {
  overview: 'Overview',
  permissions: 'Permissions',
  keys: 'API keys',
  activity: 'Activity',
  settings: 'Settings',
};

const STATUS_META: Record<BotItem['status'], { label: string; intent: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Active', intent: 'success' },
  SUSPENDED: { label: 'Suspended', intent: 'warning' },
  DELETING: { label: 'Deleting', intent: 'neutral' },
  DELETED: { label: 'Deleted', intent: 'neutral' },
};

const EMPTY_APPLICATIONS: BotCatalogApplicationItem[] = [];
const EMPTY_GRANTS: BotGrantItem[] = [];
const EMPTY_KEYS: BotKeyItem[] = [];

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
  const [generateOpen, setGenerateOpen] = useState(() => generate === true && bot.data !== undefined && canGenerateKey(bot.data.status, bot.data.activeKeyCount));
  const [revealed, setRevealed] = useState<{ key: string; name: string; expiresAt: string } | null>(null);
  const keySummary = useMemo(() => summarizeKeys(keys.data?.keys ?? EMPTY_KEYS), [keys.data]);
  useCrumbLeaf(bot.data?.displayName);

  useEffect(() => {
    if (!generate) return;
    void navigate({ search: prev => ({ ...prev, generate: undefined }), replace: true });
  }, [generate, navigate]);

  if (!canManage) return <GatedNotice subject="Bots" personal={org?.type === 'PERSONAL'} />;

  if (bot.isLoading)
    return (
      <div className={styles.loadingBlock}>
        <Spinner size="lg" label="Loading bot" />
      </div>
    );

  if (bot.error || !bot.data)
    return (
      <Alert intent="danger" title="Couldn’t load this bot">
        {bot.error ? botErrorMessage(bot.error) : 'This bot no longer exists.'}
      </Alert>
    );

  const data = bot.data;
  const status = STATUS_META[data.status];
  const activeKeyCount = keys.data ? keySummary.active.length : data.activeKeyCount;
  const applications = catalog.data?.applications ?? EMPTY_APPLICATIONS;
  const grants = permissions.data?.grants ?? EMPTY_GRANTS;
  const counts: Partial<Record<BotTab, number>> = { permissions: permissions.data ? grants.length : undefined, keys: activeKeyCount };
  const goToTab = (next: BotTab): void => void navigate({ search: prev => ({ ...prev, tab: parseBotTab(next) }), replace: true });

  const toggleSuspend = (): void => {
    const mutation = data.status === 'ACTIVE' ? suspend : resume;
    const verb = data.status === 'ACTIVE' ? 'suspended' : 'resumed';
    require(() => mutation.mutate(botId, { onSuccess: () => toast.success(`${data.displayName} ${verb}`), onError: error => toast.danger(botErrorMessage(error)) }));
  };

  return (
    <>
      <PageHeader
        leading={<Avatar icon={<BotIcon size={28} />} shape="square" size="xl" />}
        title={data.displayName}
        tags={
          <StatusChip intent={status.intent} dot>
            {status.label}
          </StatusChip>
        }
        subtitle={
          <span className={styles.detailMeta}>
            <span className={styles.detailMetaId}>{data.handle}[bot]</span>
            <span aria-hidden="true">·</span>
            <span className={styles.detailMetaItem}>
              ID <span className={styles.detailMetaId}>{data.id}</span>
              <CopyButton value={data.id} label="Copy bot ID" />
            </span>
            {data.createdBy && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Created by {data.createdBy.displayName ?? 'a former member'} on {formatDate(data.createdAt)}
                </span>
              </>
            )}
          </span>
        }
        actions={
          isManageable(data.status) && (
            <Button variant="secondary" size="sm" loading={suspend.isPending || resume.isPending} onClick={toggleSuspend}>
              {data.status === 'ACTIVE' ? 'Suspend' : 'Resume'}
            </Button>
          )
        }
      />

      <div className={styles.page}>
        {data.deletion && <DeletionNotice orgId={orgId} bot={data} require={require} />}
        {data.status === 'SUSPENDED' && !data.deletion && (
          <Alert intent="warning" role="status" title="This bot is suspended.">
            Its keys stop working within a minute. Records and grants stay; resume it to restore access.
          </Alert>
        )}

        <Tabs
          value={tab}
          onValueChange={value => {
            if (isBotTab(value)) goToTab(value);
          }}
        >
          <Tabs.List aria-label="Bot sections" className={styles.tabList}>
            {BOT_TABS.map(key => (
              <Tabs.Tab key={key} value={key} count={counts[key]}>
                {TAB_LABEL[key]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="overview">
            <OverviewTab
              bot={data}
              keySummary={keySummary}
              keysState={keys.isLoading ? 'loading' : keys.error && !keys.data ? 'error' : 'ready'}
              orgId={orgId}
              botId={botId}
              applications={applications}
              grants={grants}
              onManageKeys={() => goToTab('keys')}
              onEditPermissions={() => goToTab('permissions')}
              onViewActivity={() => goToTab('activity')}
            />
          </Tabs.Panel>
          <Tabs.Panel value="permissions">
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
          </Tabs.Panel>
          <Tabs.Panel value="keys">
            <KeysTab
              orgId={orgId}
              botId={botId}
              status={data.status}
              keys={keys.data?.keys ?? EMPTY_KEYS}
              activeKeyCount={activeKeyCount}
              isLoading={keys.isLoading}
              error={keys.data ? null : keys.error}
              require={require}
              onGenerate={() => setGenerateOpen(true)}
            />
          </Tabs.Panel>
          <Tabs.Panel value="activity">
            <ActivityTab orgId={orgId} botId={botId} />
          </Tabs.Panel>
          <Tabs.Panel value="settings" forceMount hidden={tab !== 'settings'}>
            <SettingsTab orgId={orgId} organisationName={org?.name ?? 'this organization'} bot={data} require={require} />
          </Tabs.Panel>
        </Tabs>
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
    </>
  );
}
