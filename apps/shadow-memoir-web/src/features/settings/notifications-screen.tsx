import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Button, Card, Skeleton, Switch } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { useAccountCommand, useNotificationSettings } from '@/lib/data';

import styles from './settings.module.css';

export function NotificationSettingsScreen(): ReactElement {
  const settings = useNotificationSettings();
  const command = useAccountCommand();

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
              <h2 className={screenStyles.cardTitle}>Where push lives</h2>
              <p className={screenStyles.cardBody}>
                Push is a decision per browser rather than per category, so it is one switch here and the devices that carry it are listed under App and sync.
              </p>
              <div className={styles.actions}>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/settings/app">Registered devices</Link>
                </Button>
              </div>
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
            <Alert intent="info" title={settings.data.pushOptIn ? 'Push is on for this browser' : 'Push is off for this browser'}>
              {settings.data.permissionNote}
            </Alert>

            <Card padding="lg">
              <div className={styles.settingRows}>
                <div className={styles.settingRow}>
                  <div>
                    <div className={styles.settingLabel}>Push on this browser</div>
                    <p className={styles.settingHelp}>One switch for this device. Removing the device under App and sync turns it off there too.</p>
                  </div>
                  <div className={styles.settingControl}>
                    <Switch
                      checked={settings.data.pushOptIn}
                      aria-label="Push on this browser"
                      onCheckedChange={checked => command.mutate({ type: 'notification.setPush', enabled: checked })}
                    />
                  </div>
                </div>

                {settings.data.preferences.map(preference => (
                  <div key={preference.id} className={styles.settingRow}>
                    <div>
                      <div className={styles.settingLabel}>{preference.label}</div>
                      <p className={styles.settingHelp}>{preference.help}</p>
                    </div>
                    <div className={styles.settingControl}>
                      <Switch
                        checked={preference.email}
                        aria-label={`${preference.label} by email`}
                        onCheckedChange={checked => command.mutate({ type: 'notification.set', preferenceId: preference.id, enabled: checked })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </ScreenColumns>
    </Screen>
  );
}
