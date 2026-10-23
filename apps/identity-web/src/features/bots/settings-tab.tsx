import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, FormField, Input, NumberStepper, Textarea, toast, TokenInput, type TokenValue } from '@shadow-library/ui';

import { SectionCard } from '@/components/si';
import { type BotItem, useUpdateBotMutation } from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { isValidRateLimit, MAX_RATE_LIMIT, MIN_RATE_LIMIT, rateLimitError } from '@/lib/bot-rate-limit';
import { validateCidr } from '@/lib/cidr';
import { DeleteBotDialog } from './delete-bot-dialog';
import { isManageable } from './bot-detail.shared';
import styles from './bots.module.css';

const MAX_IP_ENTRIES = 20;

interface SettingsTabProps {
  orgId: string;
  organisationName: string;
  bot: BotItem;
  require: (action: () => void) => void;
  onSuspendToggle: () => void;
  suspendPending: boolean;
}

export function SettingsTab({ orgId, organisationName, bot, require, onSuspendToggle, suspendPending }: SettingsTabProps): React.JSX.Element {
  const update = useUpdateBotMutation(orgId);
  const navigate = useNavigate();
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
