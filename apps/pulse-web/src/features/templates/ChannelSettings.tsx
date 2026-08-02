/**
 * Importing npm packages
 */
import { type ReactElement, useState } from 'react';
import { Alert, Card, Switch } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { CHANNEL_OPTIONS, SectionHeader } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type ChannelSettingResponse, type NotificationChannel, useUpdateChannelSettingMutation } from '@/lib';

import styles from './Templates.module.css';

const CHANNEL_HINTS: Record<NotificationChannel, string> = {
  EMAIL: 'Subject + HTML body rendered through a layout.',
  SMS: 'Plain-text body, 160 characters per segment.',
  PUSH: 'Title on the first line, message beneath.',
};

export default function ChannelSettings({ templateId, channels }: { templateId: string; channels: ChannelSettingResponse[] }): ReactElement {
  const [error, setError] = useState('');
  const mutation = useUpdateChannelSettingMutation(templateId);
  const enabledFor = (channel: NotificationChannel): boolean => channels.some(setting => setting.channel === channel && setting.isEnabled);

  const toggle = (channel: NotificationChannel, isEnabled: boolean): void => {
    setError('');
    mutation.mutate({ channel, isEnabled }, { onError: apiError => setError(apiError.message) });
  };

  return (
    <>
      <SectionHeader title="Channels" subtitle="Enable the delivery channels this template renders content for." />
      {error ? (
        <Alert intent="danger" title="Couldn't update channel" className={controls.detailCard}>
          {error}
        </Alert>
      ) : null}
      <Card padding="md" className={controls.detailCard}>
        <Card.Body>
          <div className={styles.switchList}>
            {CHANNEL_OPTIONS.map(option => (
              <Switch
                key={option.value}
                label={option.label}
                description={CHANNEL_HINTS[option.value]}
                checked={enabledFor(option.value)}
                onCheckedChange={next => toggle(option.value, next)}
                pending={mutation.isPending && mutation.variables?.channel === option.value}
              />
            ))}
          </div>
        </Card.Body>
      </Card>
    </>
  );
}
