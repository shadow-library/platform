import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, FormField, Input, NumberStepper, Textarea, toast, TokenInput } from '@shadow-library/ui';

import { DangerZone, SectionCard } from '@/components/si';
import { type BotItem, useUpdateBotMutation } from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { MAX_RATE_LIMIT, MIN_RATE_LIMIT } from '@/lib/bot-rate-limit';
import { validateCidr } from '@/lib/cidr';
import { isManageable } from './bot-detail.shared';
import { applyOverrides, type BotSettingsDraft, type BotSettingsOverrides, canSaveSettings, settingsBaseline, settingsErrors, settingsPatch } from './bot-settings-form';
import { DeleteBotDialog } from './delete-bot-dialog';
import styles from './bots.module.css';

const MAX_IP_ENTRIES = 20;

interface SettingsTabProps {
  orgId: string;
  organisationName: string;
  bot: BotItem;
  require: (action: () => void) => void;
}

export function SettingsTab({ orgId, organisationName, bot, require }: SettingsTabProps): React.JSX.Element {
  const update = useUpdateBotMutation(orgId);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [overrides, setOverrides] = useState<BotSettingsOverrides>({});

  const manageable = isManageable(bot.status);
  const baseline = settingsBaseline(bot);
  const draft = applyOverrides(baseline, overrides);
  const errors = settingsErrors(draft);
  const canSave = manageable && canSaveSettings(baseline, draft);

  const edit =
    <K extends keyof BotSettingsDraft>(field: K) =>
    (value: BotSettingsDraft[K]): void =>
      setOverrides(current => ({ ...current, [field]: value }));

  const save = (): void => {
    if (!canSave) return;
    const submitted = overrides;
    const body = settingsPatch(baseline, draft);
    require(() =>
      update.mutate(
        { botId: bot.id, body },
        {
          onSuccess: () => {
            setOverrides(current => (current === submitted ? {} : current));
            toast.success('Bot updated');
          },
          onError: error => toast.danger(botErrorMessage(error)),
        },
      ),
    );
  };

  return (
    <div className={styles.settingsStack}>
      <SectionCard title="Bot settings" description="The handle can’t change, because records the bot owns point to it.">
        <div className={styles.form}>
          <FormField label="Display name" error={errors.displayName}>
            <Input value={draft.displayName} onValueChange={edit('displayName')} disabled={!manageable} />
          </FormField>
          <FormField label="Handle" helper="Handles can’t be changed after creation.">
            <Input value={bot.handle} suffix="[bot]" disabled readOnly />
          </FormField>
          <FormField label="Description" optional>
            <Textarea value={draft.description} onValueChange={edit('description')} minRows={2} maxLength={280} disabled={!manageable} />
          </FormField>

          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Network &amp; limits</h3>
            <p className={styles.formSectionDesc}>Checked every time an app exchanges one of this bot’s keys.</p>
          </div>
          <FormField
            label="Allowed IP ranges"
            error={errors.ipAllowlist}
            helper={errors.ipAllowlist ? undefined : 'Requests from any other address are refused. Leave empty to allow all addresses.'}
          >
            <TokenInput
              value={draft.ipAllowlist}
              onValueChange={edit('ipAllowlist')}
              validate={validateCidr}
              maxTokens={MAX_IP_ENTRIES}
              placeholder="Add a CIDR range"
              disabled={!manageable}
            />
          </FormField>
          <FormField label="Rate limit" error={errors.rateLimitPerMinute} helper={errors.rateLimitPerMinute ? undefined : 'Requests over the limit get a 429 response.'}>
            <NumberStepper
              value={draft.rateLimitPerMinute}
              onValueChange={edit('rateLimitPerMinute')}
              min={MIN_RATE_LIMIT}
              max={MAX_RATE_LIMIT}
              clampOnBlur={false}
              unit="requests / minute per app"
              disabled={!manageable}
            />
          </FormField>

          <div className={styles.formActions}>
            <Button variant="primary" size="sm" loading={update.isPending} disabled={!canSave} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      </SectionCard>

      {manageable && (
        <DangerZone
          title="Delete this bot"
          description="Its records move to a member you choose first. Keys and grants are removed permanently."
          actionLabel="Delete bot…"
          onAction={() => setDeleteOpen(true)}
        />
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
