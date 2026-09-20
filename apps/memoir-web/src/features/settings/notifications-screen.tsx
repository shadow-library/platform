import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, Skeleton, Switch } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { type AccountCommandHook, type NotificationPreference, notifyOutcome, useAccountCommand, useNotificationSettings } from '@/lib/data';

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
              <Card.Body>
                <h2 className={screenStyles.cardTitle}>Where push lives</h2>
                <p className={screenStyles.cardBody}>
                  Push is coming soon. When it arrives it will be one switch per browser here, and the devices that carry it will be listed under App and sync.
                </p>
                <div className={styles.actions}>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/settings/app">Registered devices</Link>
                  </Button>
                </div>
              </Card.Body>
            </Card>

            <Card padding="md">
              <Card.Body>
                <h2 className={screenStyles.cardTitle}>Quiet by default</h2>
                <p className={screenStyles.cardBody}>
                  Reminders are never sent outside your wake window, and Memoir will not notify you about a missed quest or a day you did not open it. A quiet day is not an
                  emergency.
                </p>
              </Card.Body>
            </Card>
          </>
        }
      >
        <DataState query={settings} source="server" skeleton={<Skeleton.Card />}>
          {data => (
            <>
              <Alert intent="info" title="Push notifications are coming soon">
                Email stays the only way to hear from Memoir for now.
              </Alert>

              <Card padding="lg">
                <Card.Body>
                  <div className={styles.settingRows}>
                    <div className={styles.settingRow}>
                      <div className={styles.settingRowText}>
                        <div className={styles.settingLabel}>Push on this browser</div>
                        <p className={styles.settingHelp}>Not available yet — email is the only channel for now.</p>
                      </div>
                      <div className={styles.settingControl}>
                        <Switch checked={false} disabled aria-label="Push on this browser" />
                      </div>
                    </div>

                    {data.preferences.map(preference => (
                      <EmailPreferenceRow key={preference.id} preference={preference} command={command} />
                    ))}
                  </div>
                </Card.Body>
              </Card>
            </>
          )}
        </DataState>
      </ScreenColumns>
    </Screen>
  );
}

interface EmailPreferenceRowProps {
  preference: NotificationPreference;
  command: AccountCommandHook;
}

function EmailPreferenceRow({ preference, command }: EmailPreferenceRowProps): ReactElement {
  const [override, setOverride] = useState<boolean | undefined>();
  const pending = command.isPendingFor(item => item.type === 'notification.set' && item.preferenceId === preference.id);

  const toggle = async (checked: boolean): Promise<void> => {
    if (pending) return;
    setOverride(checked);
    const outcome = await command.run({ type: 'notification.set', preferenceId: preference.id, enabled: checked });
    setOverride(undefined);
    if (outcome.status === 'applied') return notifyOutcome(outcome, { success: outcome.local.message, action: 'save', subject: preference.label });
    notifyOutcome(outcome, { success: '', action: 'save', subject: preference.label });
  };

  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowText}>
        <div className={styles.settingLabel}>{preference.label}</div>
        <p className={styles.settingHelp}>{preference.help}</p>
      </div>
      <div className={styles.settingControl}>
        <Switch checked={override ?? preference.email} pending={pending} aria-label={`${preference.label} by email`} onCheckedChange={checked => void toggle(checked)} />
      </div>
    </div>
  );
}
