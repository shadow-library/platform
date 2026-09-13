import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
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
  Spinner,
  Table,
  Textarea,
  toast,
  toISODate,
  TokenInput,
  type TokenValue,
} from '@shadow-library/ui';

import { ArrowLeftIcon, BotIcon, KeyIcon } from '@/components/icons';
import { SectionCard, StatusChip } from '@/components/si';
import { SecretDialog } from '@/features/console';
import { useStepUpGate } from '@/features/portal';
import {
  type BotItem,
  type BotKeyItem,
  botKeysQueryOptions,
  botQueryOptions,
  isApiError,
  myOrganisationsQueryOptions,
  orgAccessOf,
  useBotKeysQuery,
  useBotQuery,
  useCreateBotKeyMutation,
  useOrgAccess,
  useResumeBotMutation,
  useRevokeBotKeyMutation,
  useSuspendBotMutation,
  useUpdateBotMutation,
} from '@/lib/apis';
import { botErrorMessage, botFieldError } from '@/lib/bot-errors';
import { validateCidr } from '@/lib/cidr';
import { formatDate, relativeTime } from '@/lib/format';

import styles from './bots.module.css';

type Tab = 'overview' | 'keys' | 'settings';

interface BotSearch {
  tab?: Tab;
  generate?: boolean;
}

export const Route = createFileRoute('/_portal/organizations/$orgId/bots/$botId')({
  validateSearch: (search: Record<string, unknown>): BotSearch => {
    const tab = search.tab;
    return { tab: tab === 'keys' || tab === 'settings' ? tab : undefined, generate: search.generate === true ? true : undefined };
  },
  loader: async ({ context, params }) => {
    const mine = await context.queryClient.ensureQueryData(myOrganisationsQueryOptions());
    if (!orgAccessOf(mine, params.orgId).canManage) return;
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(botQueryOptions(params.orgId, params.botId)),
        context.queryClient.ensureQueryData(botKeysQueryOptions(params.orgId, params.botId)),
      ]);
    } catch (error) {
      if (!isApiError(error) || error.status !== 404) throw error;
    }
  },
  component: BotDetailPage,
});

const NAV_ITEMS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'keys', label: 'API keys' },
  { key: 'settings', label: 'Settings' },
];

const STATUS_META: Record<BotItem['status'], { label: string; intent: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Active', intent: 'success' },
  SUSPENDED: { label: 'Suspended', intent: 'warning' },
  DELETING: { label: 'Deleting', intent: 'neutral' },
  DELETED: { label: 'Deleted', intent: 'neutral' },
};

const MAX_RATE_LIMIT = 600;
const MAX_IP_ENTRIES = 20;
const MAX_ACTIVE_KEYS = 2;
const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LIFETIME_DAYS = 365;

function isManageable(status: BotItem['status']): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED';
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

function BotDetailPage(): React.JSX.Element {
  const { orgId, botId } = Route.useParams();
  const { tab = 'overview', generate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { org, canManage } = useOrgAccess(orgId);
  const bot = useBotQuery(orgId, botId, canManage);
  const keys = useBotKeysQuery(orgId, botId, canManage);
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
        <div className={styles.detailActions}>
          {manageable && (
            <Button variant="secondary" size="sm" loading={suspend.isPending || resume.isPending} onClick={toggleSuspend}>
              {data.status === 'ACTIVE' ? 'Suspend' : 'Resume'}
            </Button>
          )}
          <Button variant="primary" size="sm" prefix={<KeyIcon size={14} />} disabled={!canGenerateKey} onClick={() => setGenerateOpen(true)}>
            Generate key
          </Button>
        </div>
      </div>

      <div className={styles.detailLayout}>
        <nav className={styles.sectionNav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              className={styles.navItem}
              data-active={tab === item.key || undefined}
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => void navigate({ search: prev => ({ ...prev, tab: item.key === 'overview' ? undefined : item.key }), replace: true })}
            >
              <span className={styles.navLabel}>{item.label}</span>
              {item.key === 'keys' && <span className={styles.navCount}>{data.activeKeyCount}</span>}
            </button>
          ))}
        </nav>

        <div className={styles.sectionBody}>
          {tab === 'overview' && (
            <OverviewTab bot={data} activeKeys={activeKeys} onManageKeys={() => void navigate({ search: prev => ({ ...prev, tab: 'keys' }), replace: true })} />
          )}
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
          {tab === 'settings' && <SettingsTab orgId={orgId} bot={data} require={require} onSuspendToggle={toggleSuspend} suspendPending={suspend.isPending || resume.isPending} />}
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

interface OverviewTabProps {
  bot: BotItem;
  activeKeys: BotKeyItem[];
  onManageKeys: () => void;
}

function OverviewTab({ bot, activeKeys, onManageKeys }: OverviewTabProps): React.JSX.Element {
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
  bot: BotItem;
  require: (action: () => void) => void;
  onSuspendToggle: () => void;
  suspendPending: boolean;
}

function SettingsTab({ orgId, bot, require, onSuspendToggle, suspendPending }: SettingsTabProps): React.JSX.Element {
  const update = useUpdateBotMutation(orgId);
  const [displayName, setDisplayName] = useState(bot.displayName);
  const [description, setDescription] = useState(bot.description ?? '');
  const [ipAllowlist, setIpAllowlist] = useState<TokenValue[]>(bot.ipAllowlist.map(value => ({ value, valid: true })));
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<number | null>(bot.rateLimitPerMinute);
  const [nameError, setNameError] = useState<string | undefined>();

  const hasInvalidIp = ipAllowlist.some(token => !token.valid);
  const rateLimitInvalid = rateLimitPerMinute === null;
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
    if (hasInvalidIp || rateLimitInvalid) return;
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
          <FormField
            label="Rate limit"
            error={rateLimitInvalid ? 'Enter a rate limit.' : undefined}
            helper={rateLimitInvalid ? undefined : 'Requests over the limit get a 429 response.'}
          >
            <NumberStepper value={rateLimitPerMinute} onValueChange={setRateLimitPerMinute} min={1} max={MAX_RATE_LIMIT} unit="requests / minute per app" />
          </FormField>
          <div className={styles.formActions}>
            <Button variant="primary" size="sm" loading={update.isPending} disabled={hasInvalidIp || rateLimitInvalid} onClick={saveNetwork}>
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

      <div className={styles.dangerCard}>
        <div>
          <div className={styles.dangerTitle}>Delete this bot</div>
          <div className={styles.dangerDesc}>Available soon. Its records will move to a member you choose first; keys and grants will be removed permanently.</div>
        </div>
        <Button variant="danger" disabled>
          Delete bot…
        </Button>
      </div>
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
