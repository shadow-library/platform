import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Avatar, Button, DescriptionList, FormField, Input, NumberStepper, Textarea, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

import { ArrowLeftIcon, BotIcon } from '@/components/icons';
import { SectionCard } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { myOrganisationsQueryOptions, useCreateBotMutation, useOrgAccess } from '@/lib/apis';
import { botErrorMessage, botFieldError } from '@/lib/bot-errors';
import { validateCidr } from '@/lib/cidr';

import styles from './bots.module.css';

export const Route = createFileRoute('/_portal/organizations/$orgId/bots/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(myOrganisationsQueryOptions()),
  component: NewBotPage,
});

const HANDLE_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const MAX_RATE_LIMIT = 600;
const MAX_IP_ENTRIES = 20;

function NewBotPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const { org, canManage } = useOrgAccess(orgId);
  const create = useCreateBotMutation(orgId);
  const { require, dialog } = useStepUpGate();

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [ipAllowlist, setIpAllowlist] = useState<TokenValue[]>([]);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<number | null>(MAX_RATE_LIMIT);
  const [nameError, setNameError] = useState<string | undefined>();
  const [handleError, setHandleError] = useState<string | undefined>();

  if (!canManage)
    return (
      <p className={styles.introText}>{org?.type === 'PERSONAL' ? 'Bots aren’t available to personal workspaces.' : 'Bots are managed by the organization’s owners and admins.'}</p>
    );

  const backToList = (): void => void navigate({ to: '/organizations/$orgId/bots', params: { orgId } });

  const validIps = ipAllowlist.filter(token => token.valid).map(token => token.value);
  const hasInvalidIp = ipAllowlist.some(token => !token.valid);
  const rateLimitInvalid = rateLimitPerMinute === null;

  const submit = (): void => {
    setNameError(undefined);
    setHandleError(undefined);
    const name = displayName.trim();
    const cleanHandle = handle.trim().toLowerCase();

    if (!name) {
      setNameError('Enter a display name.');
      return;
    }
    if (!HANDLE_PATTERN.test(cleanHandle) || cleanHandle.length > 39) {
      setHandleError('Lowercase letters, numbers and hyphens, starting and ending with a letter or number.');
      return;
    }
    if (hasInvalidIp || rateLimitInvalid) return;

    require(() =>
      create.mutate(
        {
          handle: cleanHandle,
          displayName: name,
          description: description.trim() || undefined,
          ipAllowlist: validIps.length > 0 ? validIps : undefined,
          rateLimitPerMinute,
        },
        {
          onSuccess: bot => {
            toast.success(`${bot.displayName} created`);
            void navigate({ to: '/organizations/$orgId/bots/$botId', params: { orgId, botId: bot.id }, search: { tab: 'keys', generate: true } });
          },
          onError: error => {
            const fieldError = botFieldError(error);
            if (fieldError?.field === 'handle') setHandleError(fieldError.message);
            else toast.danger(botErrorMessage(error));
          },
        },
      ),
    );
  };

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backLink} onClick={backToList}>
        <ArrowLeftIcon size={15} />
        All bots
      </button>

      <div>
        <h2 className={styles.tabTitle}>New bot</h2>
        <p className={styles.tabDesc}>You’ll generate its first API key right after creating it.</p>
      </div>

      <div className={styles.createGrid}>
        <div className={styles.formCol}>
          <SectionCard title="Details" description="Members see the handle wherever the bot creates or changes something.">
            <div className={styles.form}>
              <FormField label="Display name" required error={nameError}>
                <Input value={displayName} onValueChange={setDisplayName} placeholder="Curation bot" autoFocus />
              </FormField>
              <FormField label="Handle" required error={handleError} helper={handleError ? undefined : 'Lowercase letters, numbers and hyphens. Can’t be changed later.'}>
                <Input value={handle} onValueChange={value => setHandle(value.toLowerCase())} placeholder="curation-bot" suffix="[bot]" />
              </FormField>
              <FormField label="Description" optional>
                <Textarea value={description} onValueChange={setDescription} minRows={2} maxLength={280} placeholder="What this bot does and why it exists." />
              </FormField>
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
            </div>
          </SectionCard>

          <div className={styles.formActions}>
            <Button variant="ghost" onClick={backToList}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} disabled={hasInvalidIp || rateLimitInvalid} onClick={submit}>
              Create bot
            </Button>
          </div>
        </div>

        <aside className={styles.summaryCard}>
          <div className={styles.summaryTitle}>Summary</div>
          <div className={styles.summaryBot}>
            <Avatar icon={<BotIcon size={16} />} shape="square" size="md" />
            <div>
              <div className={styles.summaryName}>{displayName || 'New bot'}</div>
              <div className={styles.summaryHandle}>{(handle || 'handle') + '[bot]'}</div>
            </div>
          </div>
          <DescriptionList layout="column">
            <DescriptionList.Item term="Network">
              {validIps.length > 0 ? `${validIps.length} IP range${validIps.length === 1 ? '' : 's'}` : 'All addresses allowed'}
            </DescriptionList.Item>
            <DescriptionList.Item term="Rate limit">{rateLimitPerMinute ?? '—'} / min</DescriptionList.Item>
          </DescriptionList>
          <div className={styles.summaryNote}>Creating a bot asks you to confirm it’s you.</div>
        </aside>
      </div>
      {dialog}
    </div>
  );
}
