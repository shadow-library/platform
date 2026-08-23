import { Link } from '@tanstack/react-router';
import { Fragment, type ReactElement } from 'react';
import { Alert, Button, Card, EmptyState, Skeleton, Switch } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type NotificationChannel, useAccountCommand, useNotificationSettings } from '@/lib/data';

import styles from './settings.module.css';

export function NotificationSettingsScreen(): ReactElement {
  const settings = useNotificationSettings();
  const command = useAccountCommand();

  const set = (preferenceId: string, channel: NotificationChannel, enabled: boolean): void => {
    command.mutate({ type: 'notification.set', preferenceId, channel, enabled });
  };

  return (
    <Screen
      title="Notifications"
      subtitle="Everything here starts off. Nothing is sent unless you turn it on, and nothing is ever sent about a quest you missed."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings">Settings</Link>
        </Button>
      }
    >
      <ScreenColumns
        aside={
          <>
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Devices subscribed</h2>
              {settings.data && settings.data.devices.length > 0 ? (
                <ul className={styles.deviceRows}>
                  {settings.data.devices.map(device => (
                    <li key={device.id} className={styles.deviceRow}>
                      <span>
                        <span className={styles.rowTitle}>{device.name}</span>
                        <span className={styles.rowMeta}>{device.current ? `This device · ${device.meta.toLowerCase()}` : device.meta}</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => command.mutate({ type: 'notification.removeDevice', deviceId: device.id })}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState size="inline" title="No devices yet" description="A device appears here the first time you turn a push category on." />
              )}
            </Card>

            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Quiet by default</h2>
              <p className={screenStyles.cardBody}>
                Reminders are never sent outside your wake window, and Shadow Memoir will not notify you about a missed quest or a day you did not open it. A quiet day is not an
                emergency.
              </p>
            </Card>
          </>
        }
      >
        {settings.isPending || !settings.data ? <Skeleton.Card /> : null}

        {settings.data ? (
          <>
            <Alert intent="info" title={settings.data.pushPermission === 'granted' ? 'Push is allowed on this device' : 'Push has not been asked for yet'}>
              {settings.data.permissionNote}
            </Alert>

            <Card padding="lg">
              <div className={styles.matrix}>
                <div className={styles.matrixHead}>Category</div>
                <div className={styles.matrixHead}>Push</div>
                <div className={styles.matrixHead}>Email</div>
                {settings.data.preferences.map(preference => (
                  <Fragment key={preference.id}>
                    <div className={styles.matrixLabel}>
                      <div className={styles.settingLabel}>{preference.label}</div>
                      <p className={styles.settingHelp}>{preference.help}</p>
                    </div>
                    <div className={styles.matrixCell}>
                      <Switch checked={preference.push} aria-label={`${preference.label} by push`} onCheckedChange={checked => set(preference.id, 'push', checked)} />
                    </div>
                    <div className={styles.matrixCell}>
                      <Switch checked={preference.email} aria-label={`${preference.label} by email`} onCheckedChange={checked => set(preference.id, 'email', checked)} />
                    </div>
                  </Fragment>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </ScreenColumns>
    </Screen>
  );
}
